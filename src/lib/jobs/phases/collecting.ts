import type { Logger } from 'pino';
import type { CollectionJob, FundraisingPage } from '@prisma/client';
import { prisma } from '../../db';
import { env } from '@/config/env';
import { createJobLogger } from '@/lib/logging/journeys';
import {
  getNextEnabledPhase as _getNextEnabledPhase,
  getPhaseStartProgress as _getPhaseStartProgress,
} from '../phase-routing';
import {
  collectNetDonorData,
  collectFundraisingSnapshots,
} from '../helpers/fundraising';
import { collectGA4Metrics } from '../helpers/ga4';
import type { PhaseResult } from './types';

export async function processCollectionPhase(
  job: CollectionJob,
  deps: { logger: Logger }
): Promise<PhaseResult> {
  const { logger } = deps;
  const jobLogger = createJobLogger(job.id, job.jobType);
  const phaseStart = performance.now();

  // Log phase start
  if (job.processedPages === 0) {
    jobLogger.phaseStarted('COLLECTING', job.totalPages);
  }

  // Build where clause - single page or all active pages
  const whereClause = job.targetPageId ? { id: job.targetPageId } : { status: 'ACTIVE' as const };

  // Get pages that need GA4 metrics collection
  const debugLimit = env.SYNC_DEBUG_LIMIT;
  let pages: FundraisingPage[];
  if (!job.targetPageId && debugLimit > 0) {
    // Debug mode: only collect the N most recently modified pages
    const remaining = debugLimit - job.processedPages;
    pages =
      remaining > 0
        ? await prisma.fundraisingPage.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { enModifiedAt: 'desc' },
            skip: job.processedPages,
            take: remaining,
          })
        : [];
  } else {
    pages = await prisma.fundraisingPage.findMany({
      where: whereClause,
      skip: job.processedPages,
    });
  }

  if (pages.length === 0) {
    const phaseDuration = performance.now() - phaseStart;
    const errorCount =
      (job.errors as any[])?.filter((e: any) => e.phase === 'COLLECTING').length || 0;
    jobLogger.phaseCompleted('COLLECTING', job.processedPages, errorCount, phaseDuration);

    // Move to next enabled phase
    const nextPhase = await _getNextEnabledPhase('COLLECTING', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'GA4 collection complete, job finished (no more phases)',
      };
    }

    const nextProgress = _getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress, processedPages: 0 },
    });
    jobLogger.phaseTransition('COLLECTING', nextPhase);
    return {
      done: false,
      progress: nextProgress,
      message: `GA4 collection complete, moving to ${nextPhase}`,
    };
  }

  // Process each page in the chunk - collect GA4 metrics and NetDonor fundraising data
  let errorCount = 0;
  let processedInChunk = 0;
  for (const page of pages) {
    const pageStart = performance.now();
    let ga4Success = true;
    let netDonorResult: { success: boolean; skipped: boolean; error?: string } | null = null;

    // Collect GA4 metrics (blocking - failure counts as error)
    try {
      await collectGA4Metrics(page, { logger });
    } catch (error) {
      ga4Success = false;
      logger.error({ event: 'job.page.ga4.failed', err: error as Error, pageId: page.id, pageName: page.name }, `Failed to collect GA4 metrics for page ${page.id}`);
    }

    // Collect NetDonor fundraising data (non-blocking - failures logged but don't stop job)
    // This runs regardless of GA4 success/failure
    netDonorResult = await collectNetDonorData(page, { logger });

    // Collect period-based fundraising snapshots (non-blocking)
    // This populates LAST_7_DAYS, PREV_7_DAYS, LAST_30_DAYS data for the new components
    const snapshotResult = await collectFundraisingSnapshots(page, { logger });

    const pageDuration = performance.now() - pageStart;

    // Determine overall page success
    // Page is considered successful if GA4 succeeded
    // NetDonor failures are recorded separately but don't fail the page
    const pageSuccess = ga4Success;

    if (pageSuccess) {
      jobLogger.pageProcessed(page.id, page.name, pageDuration);
      processedInChunk++;

      // Build update data - include NetDonor error if present
      const updateData: any = {
        processedPages: { increment: 1 },
        progress:
          30 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 20),
      };

      // Record non-blocking errors (NetDonor and FundraisingSnapshots)
      const nonBlockingErrors: any[] = [];

      if (
        netDonorResult &&
        !netDonorResult.success &&
        !netDonorResult.skipped &&
        netDonorResult.error
      ) {
        nonBlockingErrors.push({
          page: page.id,
          phase: 'COLLECTING',
          subPhase: 'NetDonor',
          error: netDonorResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      if (
        snapshotResult &&
        !snapshotResult.success &&
        !snapshotResult.skipped &&
        snapshotResult.error
      ) {
        nonBlockingErrors.push({
          page: page.id,
          phase: 'COLLECTING',
          subPhase: 'FundraisingSnapshots',
          error: snapshotResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      if (nonBlockingErrors.length > 0) {
        updateData.errors = {
          push: nonBlockingErrors,
        };
      }

      await prisma.collectionJob.update({
        where: { id: job.id },
        data: updateData,
      });
    } else {
      errorCount++;
      processedInChunk++;
      jobLogger.pageFailed(page.id, page.name, 'processing failed');

      // Build errors array for GA4 and any non-blocking failures
      const errors: any[] = [
        {
          page: page.id,
          phase: 'COLLECTING',
          subPhase: 'GA4',
          error: 'GA4 metrics collection failed',
          timestamp: new Date().toISOString(),
        },
      ];

      // Add NetDonor error if present
      if (
        netDonorResult &&
        !netDonorResult.success &&
        !netDonorResult.skipped &&
        netDonorResult.error
      ) {
        errors.push({
          page: page.id,
          phase: 'COLLECTING',
          subPhase: 'NetDonor',
          error: netDonorResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      // Add FundraisingSnapshots error if present
      if (
        snapshotResult &&
        !snapshotResult.success &&
        !snapshotResult.skipped &&
        snapshotResult.error
      ) {
        errors.push({
          page: page.id,
          phase: 'COLLECTING',
          subPhase: 'FundraisingSnapshots',
          error: snapshotResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      await prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          processedPages: { increment: 1 },
          progress:
            30 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 20),
          errors: {
            push: errors,
          },
        },
      });
    }
  }

  // For debug jobs: complete after this phase
  if (job.targetPageId) {
    const phaseDuration = performance.now() - phaseStart;
    jobLogger.phaseCompleted('COLLECTING', 1, errorCount, phaseDuration);

    await prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        status: errorCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        progress: 100,
        processedPages: 1,
        completedAt: new Date(),
      },
    });

    return {
      done: true,
      progress: 100,
      message:
        errorCount > 0
          ? 'GA4 collection completed with errors for this page.'
          : 'GA4 collection complete for this page.',
    };
  }

  const updatedJob = await prisma.collectionJob.findUnique({
    where: { id: job.id },
  });

  if (updatedJob && updatedJob.processedPages >= updatedJob.totalPages) {
    const phaseDuration = performance.now() - phaseStart;
    const totalErrors =
      (updatedJob.errors as any[])?.filter((e: any) => e.phase === 'COLLECTING').length || 0;
    jobLogger.phaseCompleted('COLLECTING', updatedJob.processedPages, totalErrors, phaseDuration);

    // Move to next enabled phase
    const nextPhase = await _getNextEnabledPhase('COLLECTING', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'GA4 collection complete, job finished (no more phases)',
      };
    }

    const nextProgress = _getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress, processedPages: 0 },
    });
    jobLogger.phaseTransition('COLLECTING', nextPhase);
    return {
      done: false,
      progress: nextProgress,
      message: `GA4 collection complete, moving to ${nextPhase}`,
    };
  }

  return {
    done: false,
    progress: updatedJob?.progress || 30,
    message: `Collected GA4 metrics for ${updatedJob?.processedPages} of ${updatedJob?.totalPages} pages`,
  };
}
