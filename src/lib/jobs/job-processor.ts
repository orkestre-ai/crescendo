import { prisma } from '../db';
import { env } from '@/config/env';
import { JobProcessingError } from '../errors';
import { rootLogger } from '@/lib/logging';
import { createJobLogger } from '@/lib/logging/journeys';
import { JOB_MAX_RETRIES } from '@/config/constants';
import type {
  CollectionJob,
  FundraisingPage,
  JobPhase,
  JobType,
} from '@prisma/client';

import {
  shouldSkipPhase,
  getFirstEnabledPhase,
  getNextEnabledPhase,
  getPhaseStartProgress,
} from './phase-routing';
import { processSyncPhase } from './phases/sync';
import { processScrapingPhase } from './phases/scraping';
import { processCollectionPhase } from './phases/collecting';
import { processFillMissingPhase } from './phases/filling-missing';
import { processRecommendationPhase } from './phases/recommendations';
import { processFinalizePhase } from './phases/finalize';
import { backfillGA4Metrics as _backfillGA4Metrics } from './helpers/ga4';

const JOB_PROCESSING_CONFIG = {
  PHASE_DELAY_MS: 100,
  MAX_ITERATIONS: 100,
};

export class JobProcessor {
  private log = rootLogger.child({ journey: 'job', service: 'job-processor' });
  private processingLock = new Set<string>();

  /**
   * Create a single-page debug job that starts at a specific phase
   * Used for debugging/testing individual phases on a specific page
   */
  async createSinglePageJob(
    pageId: string,
    startPhase: JobPhase,
    triggeredBy: string = 'debug'
  ): Promise<CollectionJob> {
    // Verify the page exists
    const page = await prisma.fundraisingPage.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      throw new JobProcessingError('', `Page not found: ${pageId}`);
    }

    const job = await prisma.collectionJob.create({
      data: {
        status: 'PENDING',
        triggeredBy,
        totalPages: 1,
        processedPages: 0,
        progress: getPhaseStartProgress(startPhase),
        phase: startPhase,
        targetPageId: pageId,
      },
    });

    // Log job creation
    const jobLogger = createJobLogger(job.id, job.jobType);
    jobLogger.created(1, triggeredBy);
    this.log.info({ event: 'job.debug.created', jobId: job.id,
      pageId,
      pageName: page.name,
      startPhase, }, `Created single-page debug job`);

    return job;
  }

  async createCollectionJob(
    triggeredBy: string,
    jobType: JobType = 'SYNC'
  ): Promise<CollectionJob> {
    const debugLimit = env.SYNC_DEBUG_LIMIT;
    const activeCount = await prisma.fundraisingPage.count({
      where: { status: 'ACTIVE' },
    });
    const totalPages = debugLimit > 0 ? Math.min(debugLimit, activeCount) : activeCount;

    const firstPhase = await getFirstEnabledPhase(jobType);
    const startProgress = getPhaseStartProgress(firstPhase);

    this.log.info({ event: 'job.create', triggeredBy,
      jobType,
      totalPages,
      firstPhase,
      startProgress, }, `Creating ${jobType} job`);

    const job = await prisma.collectionJob.create({
      data: {
        status: 'PENDING',
        triggeredBy,
        jobType,
        totalPages,
        processedPages: 0,
        progress: startProgress,
        phase: firstPhase,
      },
    });

    const jobLogger = createJobLogger(job.id, job.jobType);
    jobLogger.created(totalPages, triggeredBy);
    return job;
  }

  /**
   * Process a job to completion with automatic continuation.
   * This method continues processing chunks until the job completes
   * or a timeout/limit is reached.
   *
   * @param jobId - The job ID to process
   * @param options - Processing options
   * @returns Final result when job completes or yields
   */
  async processJobToCompletion(
    jobId: string,
    options?: {
      maxIterations?: number;
    }
  ): Promise<{
    done: boolean;
    progress: number;
    message: string;
    iterations: number;
    durationMs: number;
  }> {
    const TERMINAL_STATUSES = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'];

    // Database-level optimistic lock: acquire lock via version check in transaction
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.collectionJob.findUniqueOrThrow({
          where: { id: jobId },
        });

        if (current.status === 'PROCESSING') {
          throw new JobProcessingError(jobId, 'Job already being processed');
        }

        if (TERMINAL_STATUSES.includes(current.status)) {
          throw new JobProcessingError(jobId, `Job already in terminal state: ${current.status}`);
        }

        // Optimistic lock: update only if version matches
        await tx.collectionJob.update({
          where: {
            id: jobId,
            processingVersion: current.processingVersion,
          },
          data: {
            status: 'PROCESSING',
            processingVersion: { increment: 1 },
          },
        });
      });
    } catch (error) {
      if (error instanceof JobProcessingError) {
        this.log.info({ event: 'job.already.locked', jobId }, error.message);
        const current = await prisma.collectionJob.findUnique({
          where: { id: jobId },
          select: { status: true, progress: true },
        });
        return {
          done: TERMINAL_STATUSES.includes(current?.status ?? ''),
          progress: current?.progress ?? 0,
          message: error.message,
          iterations: 0,
          durationMs: 0,
        };
      }
      throw error;
    }

    // Secondary in-memory guard for same-process concurrent calls
    if (this.processingLock.has(jobId)) {
      const job = await prisma.collectionJob.findUnique({
        where: { id: jobId },
        select: { status: true, progress: true },
      });
      return {
        done: TERMINAL_STATUSES.includes(job?.status ?? ''),
        progress: job?.progress ?? 0,
        message: 'Already processing in this process',
        iterations: 0,
        durationMs: 0,
      };
    }

    this.processingLock.add(jobId);
    try {
      const startTime = Date.now();
      const maxIterations = options?.maxIterations ?? JOB_PROCESSING_CONFIG.MAX_ITERATIONS;

      let iterations = 0;
      let lastResult: { done: boolean; progress: number; message: string } = {
        done: false,
        progress: 0,
        message: 'Starting...',
      };

      this.log.info({ event: 'job.process.start', jobId,
        maxIterations, }, `Starting job processing to completion`);

      while (iterations < maxIterations) {
        iterations++;
        const iterationStart = Date.now();

        try {
          this.log.debug({ event: 'job.process.iteration', jobId,
            iteration: iterations,
            elapsedTime: Date.now() - startTime, }, `Processing iteration ${iterations}`);

          lastResult = await this.processJobChunk(jobId);

          const iterationDuration = Date.now() - iterationStart;
          this.log.debug({ event: 'job.process.iteration.complete', jobId,
            iteration: iterations,
            done: lastResult.done,
            progress: lastResult.progress,
            iterationDuration, }, `Iteration ${iterations} complete`);

          if (lastResult.done) {
            const totalDuration = Date.now() - startTime;
            this.log.info({ event: 'job.process.complete', jobId,
              iterations,
              totalDuration,
              progress: lastResult.progress, }, `Job processing completed`);
            return {
              ...lastResult,
              iterations,
              durationMs: totalDuration,
            };
          }

          // Small delay between iterations to prevent tight loops
          await new Promise((resolve) => setTimeout(resolve, JOB_PROCESSING_CONFIG.PHASE_DELAY_MS));
        } catch (error) {
          const totalDuration = Date.now() - startTime;
          this.log.error({ event: 'job.process.error', err: error as Error, jobId,
            iteration: iterations,
            totalDuration, }, `Error during job processing`);
          throw error;
        }
      }

      const totalDuration = Date.now() - startTime;

      // Reset to PENDING so a subsequent processJobToCompletion() call can pick it up.
      // The finally block clears the in-memory lock, but without this update the DB
      // row stays PROCESSING and rejects the next attempt as already-processing.
      await prisma.collectionJob.update({
        where: { id: jobId },
        data: { status: 'PENDING' },
      });

      this.log.warn({ event: 'job.process.max_iterations', jobId,
          iterations,
          totalDuration,
          progress: lastResult.progress, }, `Job processing yielding due to max iterations`);

      return {
        ...lastResult,
        done: false,
        message: `Processing yielded after ${iterations} iterations (max reached). ${lastResult.message}`,
        iterations,
        durationMs: totalDuration,
      };
    } finally {
      this.processingLock.delete(jobId);
    }
  }

  /**
   * Process a single chunk of a job.
   * This method processes one chunk and returns immediately.
   * For automatic continuation, use processJobToCompletion() instead.
   *
   * @param jobId - The job ID to process
   * @returns Result of processing this chunk
   */
  async processJobChunk(jobId: string): Promise<{
    done: boolean;
    progress: number;
    message: string;
  }> {
    const chunkStartTime = Date.now();
    this.log.info({ event: 'job.chunk.start', jobId,
      timestamp: new Date().toISOString(), }, `Starting chunk processing for job ${jobId.slice(0, 8)}`);

    const job = await prisma.collectionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      this.log.error({ event: 'job.not.found', err: new Error('Job not found'), jobId, }, `Job not found in database`);
      throw new JobProcessingError(jobId, 'Job not found');
    }

    this.log.info({ event: 'job.chunk.state', jobId,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      processedPages: job.processedPages,
      totalPages: job.totalPages,
      targetPageId: job.targetPageId, }, `Job state before processing`);

    if (
      job.status === 'COMPLETED' ||
      job.status === 'COMPLETED_WITH_ERRORS' ||
      job.status === 'FAILED' ||
      job.status === 'CANCELLED'
    ) {
      this.log.info({ event: 'job.already.terminal', jobId,
        status: job.status, }, `Job already ${job.status.toLowerCase()}`);
      return {
        done: true,
        progress: job.progress,
        message: `Job already ${job.status.toLowerCase()}`,
      };
    }

    // Update status to processing
    await prisma.collectionJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });
    this.log.debug({ event: 'job.status.updated', jobId }, `Updated to PROCESSING`);

    try {
      // For single-page jobs (targetPageId set), skip phase checks - always run the requested phase
      const isSinglePageJob = !!job.targetPageId;

      // Check if current phase should be skipped (skip for single-page jobs)
      if (!isSinglePageJob) {
        const skip = await shouldSkipPhase(job.phase, job.jobType);
        if (skip) {
          const nextPhase = await getNextEnabledPhase(job.phase, job.jobType);

          if (!nextPhase) {
            this.log.info({ event: 'job.complete.no_phases', jobId, }, `No more enabled phases, completing job`);
            await prisma.collectionJob.update({
              where: { id: jobId },
              data: {
                status: 'COMPLETED',
                progress: 100,
                completedAt: new Date(),
              },
            });
            return {
              done: true,
              progress: 100,
              message: 'Job completed (remaining phases disabled)',
            };
          }

          this.log.info({ event: 'job.phase.skip', jobId, skippedPhase: job.phase, nextPhase }, `Skipping disabled phase ${job.phase}, moving to ${nextPhase}`);

          const nextProgress = getPhaseStartProgress(nextPhase);
          await prisma.collectionJob.update({
            where: { id: jobId },
            data: {
              phase: nextPhase,
              progress: nextProgress,
              processedPages: 0,
            },
          });

          return {
            done: false,
            progress: nextProgress,
            message: `Skipped ${job.phase} (disabled), moving to ${nextPhase}`,
          };
        }
      }

      let result;
      const phaseStartTime = Date.now();

      if (job.phase === 'SYNCING') {
        this.log.info({ event: 'job.phase.entering', jobId,
          phase: 'SYNCING', }, `Entering SYNCING phase`);
        result = await processSyncPhase(job, { logger: this.log });
      } else if (job.phase === 'SCRAPING') {
        this.log.info({ event: 'job.phase.entering', jobId,
          phase: 'SCRAPING',
          processedPages: job.processedPages,
          totalPages: job.totalPages, }, `Entering SCRAPING phase`);
        result = await processScrapingPhase(job, { logger: this.log });
      } else if (job.phase === 'COLLECTING') {
        this.log.info({ event: 'job.phase.entering', jobId,
          phase: 'COLLECTING',
          processedPages: job.processedPages,
          totalPages: job.totalPages, }, `Entering COLLECTING phase`);
        result = await processCollectionPhase(job, { logger: this.log });
      } else if (job.phase === 'FILLING_MISSING') {
        this.log.info({ event: 'job.phase.entering', jobId,
          phase: 'FILLING_MISSING', }, `Entering FILLING_MISSING phase`);
        result = await processFillMissingPhase(job, { logger: this.log });
      } else if (job.phase === 'GENERATING_RECS') {
        this.log.info({ event: 'job.phase.entering', jobId,
          phase: 'GENERATING_RECS',
          processedPages: job.processedPages,
          totalPages: job.totalPages, }, `Entering GENERATING_RECS phase`);
        result = await processRecommendationPhase(job, { logger: this.log });
      } else {
        this.log.info({ event: 'job.phase.entering', jobId,
          phase: 'FINALIZING', }, `Entering FINALIZING phase`);
        result = await processFinalizePhase(job, { logger: this.log });
      }

      const chunkDuration = Date.now() - chunkStartTime;
      const phaseDuration = Date.now() - phaseStartTime;

      this.log.info({ event: 'job.chunk.complete', jobId,
        phase: job.phase,
        done: result.done,
        progress: result.progress,
        message: result.message,
        chunkDuration,
        phaseDuration, }, `Chunk processing complete`);

      // Log continuation status for debugging
      if (!result.done) {
        this.log.info({ event: 'job.continuation.needed', jobId,
          currentPhase: job.phase,
          progress: result.progress,
          message: result.message, }, `Job requires continuation`);
      }

      return result;
    } catch (error) {
      const chunkDuration = Date.now() - chunkStartTime;
      this.log.error({ event: 'job.phase.failed', err: error as Error, jobId, phase: job.phase, chunkDuration }, `Phase failed after ${chunkDuration}ms`);

      // Check retry count before marking as FAILED
      const currentJob = await prisma.collectionJob.findUnique({
        where: { id: jobId },
        select: { retryCount: true },
      });

      const errorEntry = {
        phase: job.phase,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };

      if ((currentJob?.retryCount ?? 0) < JOB_MAX_RETRIES) {
        // Increment retry count and reset to PENDING for retry
        await prisma.collectionJob.update({
          where: { id: jobId },
          data: {
            retryCount: { increment: 1 },
            status: 'PENDING',
            processingVersion: { increment: 1 },
            errors: { push: errorEntry },
          },
        });
        this.log.warn({ event: 'job.retry', jobId,
          retryCount: (currentJob?.retryCount ?? 0) + 1,
          maxRetries: JOB_MAX_RETRIES, }, `Job failed, scheduling retry`);
      } else {
        // Max retries exceeded -- mark as FAILED
        await prisma.collectionJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errors: { push: errorEntry },
          },
        });
        this.log.error({ event: 'job.max.retries', err: new Error(`Max retries exceeded`), jobId,
          retryCount: currentJob?.retryCount ?? 0, }, `Job failed after ${JOB_MAX_RETRIES} retries`);
      }
      throw error;
    }
  }

  /**
   * Backfill GA4 historical metrics for a page
   * Creates daily snapshots for each day in the specified range
   *
   * @param page - The page to backfill metrics for
   * @param days - Number of days to backfill (default 90)
   */
  async backfillGA4Metrics(
    page: FundraisingPage,
    days: number = 90
  ): Promise<{ daysBackfilled: number; daysWithData: number }> {
    return _backfillGA4Metrics(page, days, { logger: this.log });
  }
}

export const jobProcessor = new JobProcessor();
