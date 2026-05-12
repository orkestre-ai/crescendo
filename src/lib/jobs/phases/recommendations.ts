import type { Logger } from 'pino';
import type { CollectionJob } from '@prisma/client';
import { prisma } from '../../db';
import { claudeClient } from '../../claude';
import { calculateTrend } from '../../analytics';
import { getAiSettings } from '../../settings';
import { createJobLogger } from '@/lib/logging/journeys';
import {
  getNextEnabledPhase,
  getPhaseStartProgress,
} from '../phase-routing';
import type { PhaseResult } from './types';

export async function processRecommendationPhase(
  job: CollectionJob,
  deps: { logger: Logger }
): Promise<PhaseResult> {
  const { logger } = deps;
  const jobLogger = createJobLogger(job.id, job.jobType);
  const phaseStart = performance.now();

  // Log phase start
  if (job.processedPages === 0) {
    jobLogger.phaseStarted('GENERATING_RECS', job.totalPages);
  }

  // Build where clause - single page or all active pages
  const whereClause = job.targetPageId ? { id: job.targetPageId } : { status: 'ACTIVE' as const };

  // Get pages that need recommendations
  const pages = await prisma.fundraisingPage.findMany({
    where: whereClause,
    include: {
      snapshots: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
    skip: job.processedPages,
    take: 5, // Smaller batch for AI processing
  });

  if (pages.length === 0) {
    const phaseDuration = performance.now() - phaseStart;
    const errorCount =
      (job.errors as any[])?.filter((e: any) => e.phase === 'GENERATING_RECS').length || 0;
    jobLogger.phaseCompleted('GENERATING_RECS', job.processedPages, errorCount, phaseDuration);

    // Move to next enabled phase
    const nextPhase = await getNextEnabledPhase('GENERATING_RECS', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'Recommendations complete, job finished (no more phases)',
      };
    }

    const nextProgress = getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress },
    });
    jobLogger.phaseTransition('GENERATING_RECS', nextPhase);
    return { done: false, progress: nextProgress, message: `Moving to ${nextPhase} phase` };
  }

  // Fetch AI settings for configurable model/prompts
  const aiSettings = await getAiSettings();

  // Generate recommendations for each page
  let errorCount = 0;
  let processedInChunk = 0;
  for (const page of pages) {
    const pageStart = performance.now();
    try {
      if (page.snapshots.length === 0) {
        logger.warn({ event: 'job.page.skipped', pageId: page.id, pageName: page.name }, `Skipping recommendations for ${page.id} (no data)`);
        if (job.targetPageId) {
          errorCount++;
        }
        processedInChunk++;
        // Persist progress so the next chunk doesn't re-fetch this page and spin forever.
        await prisma.collectionJob.update({
          where: { id: job.id },
          data: {
            processedPages: { increment: 1 },
            progress:
              50 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 40),
          },
        });
        continue;
      }

      const latestSnapshot = page.snapshots[0];
      const trend = calculateTrend(page.snapshots);

      const recommendations = await claudeClient.generateRecommendations(
        {
          pageUrl: page.url,
          pageContent: {
            h1: page.headline,
            description: page.metaDescription,
            cta: page.ctaButtons,
            donationAmounts: page.donationAmounts,
            appealText: page.appealText,
          },
          metrics: {
            pageViews: latestSnapshot.pageViews,
            conversionRate: latestSnapshot.conversionRate,
            bounceRate: latestSnapshot.bounceRate,
            revenue: latestSnapshot.revenue,
          },
          historicalData: {
            avgConversionRate:
              page.snapshots.reduce((sum, s) => sum + s.conversionRate, 0) /
              page.snapshots.length,
            trend: trend === 'insufficient_data' ? 'stable' : trend,
          },
        },
        {
          model: aiSettings.model,
          systemPrompt: aiSettings.systemPrompt ?? undefined,
          userPromptTemplate: aiSettings.userPromptTemplate ?? undefined,
        }
      );

      // Mark old recommendations as superseded
      await prisma.optimizationRecommendation.updateMany({
        where: {
          pageId: page.id,
          status: 'ACTIVE',
        },
        data: {
          status: 'SUPERSEDED',
        },
      });

      // Create new recommendations
      for (const rec of recommendations) {
        await prisma.optimizationRecommendation.create({
          data: {
            pageId: page.id,
            snapshotId: latestSnapshot.id,
            category: rec.category,
            text: rec.text,
            confidence: rec.confidence,
            modelUsed: 'claude-haiku-4-5-20251001',
            status: 'ACTIVE',
          },
        });
      }

      const pageDuration = performance.now() - pageStart;
      jobLogger.pageProcessed(page.id, page.name, pageDuration);

      processedInChunk++;
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          processedPages: { increment: 1 },
          progress:
            50 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 40), // 50-90% for recommendations
        },
      });
    } catch (error) {
      errorCount++;
      processedInChunk++;
      jobLogger.pageFailed(page.id, page.name, 'processing failed');

      logger.error({ event: 'job.page.recommendations.failed', err: error as Error, pageId: page.id, pageName: page.name }, `Failed to generate recommendations for page ${page.id}`);

      await prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          processedPages: { increment: 1 },
          progress:
            50 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 40), // Update progress even on error
          errors: {
            push: {
              page: page.id,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            },
          },
        },
      });
    }
  }

  // For debug jobs: complete after this phase
  if (job.targetPageId) {
    const phaseDuration = performance.now() - phaseStart;
    jobLogger.phaseCompleted('GENERATING_RECS', 1, errorCount, phaseDuration);

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
          ? 'Recommendation generation completed with errors for this page.'
          : 'Recommendations generated for this page.',
    };
  }

  const updatedJob = await prisma.collectionJob.findUnique({
    where: { id: job.id },
  });

  if (updatedJob && updatedJob.processedPages >= updatedJob.totalPages) {
    const phaseDuration = performance.now() - phaseStart;
    const totalErrors =
      (updatedJob.errors as any[])?.filter((e: any) => e.phase === 'GENERATING_RECS').length || 0;
    jobLogger.phaseCompleted(
      'GENERATING_RECS',
      updatedJob.processedPages,
      totalErrors,
      phaseDuration
    );

    // Move to next enabled phase
    const nextPhase = await getNextEnabledPhase('GENERATING_RECS', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'Recommendations complete, job finished (no more phases)',
      };
    }

    const nextProgress = getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress },
    });
    jobLogger.phaseTransition('GENERATING_RECS', nextPhase);
    return {
      done: false,
      progress: nextProgress,
      message: `Recommendations complete, moving to ${nextPhase}`,
    };
  }

  return {
    done: false,
    progress: updatedJob?.progress || 50,
    message: `Generated recommendations for ${updatedJob?.processedPages} pages`,
  };
}
