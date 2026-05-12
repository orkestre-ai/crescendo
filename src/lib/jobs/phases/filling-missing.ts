import type { Logger } from 'pino';
import type { CollectionJob, FundraisingPage, PeriodType } from '@prisma/client';
import { prisma } from '../../db';
import { getGa4Client } from '../../google-analytics';
import { isENPublicConfiguredAsync } from '../../en-public-client';
import { scraper } from '../../scraper';
import { refreshScraperTrustedHostsFromDb } from '../../scraper-trust';
import { capturePageBundle } from '../../playwright-scraper';
import { uploadScreenshot } from '../../screenshot-storage';
import { getScrapableUrl, isScrapeable } from '../../url-utils';
import { getScrapingSettings } from '../../settings';
import {
  GA4_BACKFILL_DORMANCY_THRESHOLD,
  GA4_BACKFILL_MAX_RECENT_DAYS,
  GA4_BACKFILL_CONCURRENCY,
  FILL_MISSING_CONTENT_CONCURRENCY,
  FILL_MISSING_RETRY_CONCURRENCY,
} from '@/config/constants';
import { env } from '@/config/env';
import { createJobLogger } from '@/lib/logging/journeys';
import {
  collectNetDonorData,
  collectFundraisingSnapshots,
} from '../helpers/fundraising';
import { upsertZeroDataSnapshots } from '../helpers/snapshots';
import {
  getNextEnabledPhase,
  getPhaseStartProgress,
} from '../phase-routing';
import type { PhaseResult } from './types';

export async function processFillMissingPhase(
  job: CollectionJob,
  deps: { logger: Logger }
): Promise<PhaseResult> {
  const { logger } = deps;
  const jobLogger = createJobLogger(job.id, job.jobType);
  const scrapingSettings = await getScrapingSettings();
  const depth = scrapingSettings.depth;

  // Find pages with incomplete latest content snapshots
  jobLogger.phaseStarted('FILLING_MISSING', 0);

  const debugLimit = env.SYNC_DEBUG_LIMIT;
  let pages: FundraisingPage[];

  if (job.targetPageId) {
    pages = await prisma.fundraisingPage.findMany({
      where: { id: job.targetPageId, status: 'ACTIVE' },
    });
  } else if (debugLimit > 0) {
    // Respect debug limit: only fill missing data for the N most recently modified pages
    pages = await prisma.fundraisingPage.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { enModifiedAt: 'desc' },
      take: debugLimit,
    });
    logger.info({ event: 'job.fill_missing.debug_limit', jobId: job.id, debugLimit, pagesSelected: pages.length }, `FILLING_MISSING limited to ${pages.length} pages (debug limit: ${debugLimit})`);
  } else {
    pages = await prisma.fundraisingPage.findMany({ where: { status: 'ACTIVE' } });
  }

  // Trust CNAMEd EN domains synced into FundraisingPage.url before any scrape.
  await refreshScraperTrustedHostsFromDb();

  // Reset progress counters so the dashboard tracks this phase's actual workload
  // (totalPages may have carried over from COLLECTING with a different count).
  await prisma.collectionJob.update({
    where: { id: job.id },
    data: { processedPages: 0, totalPages: pages.length },
  });

  let filled = 0;

  // === GA4 Gap Detection & Backfill (parallelized) ===
  let ga4GapsFilled = 0;

  const { default: pLimit } = await import('p-limit');
  const backfillLimit = pLimit(GA4_BACKFILL_CONCURRENCY);

  const backfillResults = await Promise.all(
    pages.map((page) =>
      backfillLimit(async () => {
        let pageFilled = 0;
        try {
          // Get the date range of existing snapshots
          const dateRange = await prisma.performanceSnapshot.aggregate({
            where: { pageId: page.id },
            _min: { date: true },
            _max: { date: true },
            _count: { date: true },
          });

          const earliestDate = dateRange._min.date;
          const latestDate = dateRange._max.date;

          // Skip if no snapshots exist (COLLECTING handles initial backfill)
          if (!earliestDate || !latestDate) return pageFilled;

          // Calculate expected days from earliest snapshot to yesterday
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          const effectiveEnd = latestDate < yesterday ? yesterday : latestDate;
          const expectedDays =
            Math.ceil((effectiveEnd.getTime() - earliestDate.getTime()) / (24 * 60 * 60 * 1000)) +
            1;
          const actualDays = dateRange._count.date;

          // If no gaps, skip
          if (actualDays >= expectedDays) return pageFilled;

          const missingCount = expectedDays - actualDays;
          const coverageRatio = expectedDays > 0 ? actualDays / expectedDays : 0;

          // Skip dormant pages — not worth querying hundreds of empty days
          if (coverageRatio < GA4_BACKFILL_DORMANCY_THRESHOLD && missingCount > 30) {
            logger.info({ event: 'job.fill_missing.ga4.dormant_skipped', pageId: page.id, expectedDays, actualDays, coverageRatio: parseFloat(coverageRatio.toFixed(3)), missingCount }, `Skipping GA4 backfill for dormant page: ${page.name} (${(coverageRatio * 100).toFixed(1)}% coverage, ${missingCount} missing)`);
            return pageFilled;
          }

          logger.info({ event: 'job.fill_missing.ga4.gaps_detected', pageId: page.id, expectedDays, actualDays, missingCount, earliestDate: earliestDate.toISOString().split('T')[0], effectiveEnd: effectiveEnd.toISOString().split('T')[0] }, `Found ${missingCount} missing GA4 days for: ${page.name}`);

          // Get all existing snapshot dates for this page
          const existingSnapshots = await prisma.performanceSnapshot.findMany({
            where: { pageId: page.id },
            select: { date: true },
            orderBy: { date: 'asc' },
          });
          const existingDates = new Set(
            existingSnapshots.map((s) => s.date.toISOString().split('T')[0])
          );

          // Find contiguous gaps and group them into ranges
          const gaps: Array<{ start: string; end: string }> = [];
          let gapStart: string | null = null;
          let gapEnd: string | null = null;

          const cursor = new Date(earliestDate);
          cursor.setHours(0, 0, 0, 0);

          while (cursor <= effectiveEnd) {
            const dateStr = cursor.toISOString().split('T')[0];

            if (!existingDates.has(dateStr)) {
              if (!gapStart) {
                gapStart = dateStr;
              }
              gapEnd = dateStr;
            } else {
              if (gapStart && gapEnd) {
                gaps.push({ start: gapStart, end: gapEnd });
                gapStart = null;
                gapEnd = null;
              }
            }

            cursor.setDate(cursor.getDate() + 1);
          }
          // Don't forget the last gap
          if (gapStart && gapEnd) {
            gaps.push({ start: gapStart, end: gapEnd });
          }

          // Trim gaps to only the most recent N missing days
          // Gaps are in chronological order — take from the end
          let totalGapDays = 0;
          for (const gap of gaps) {
            const start = new Date(gap.start);
            const end = new Date(gap.end);
            totalGapDays +=
              Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
          }

          let trimmedGaps = gaps;
          if (totalGapDays > GA4_BACKFILL_MAX_RECENT_DAYS) {
            // Walk backwards through gaps, keeping only the most recent N days
            trimmedGaps = [];
            let daysRemaining = GA4_BACKFILL_MAX_RECENT_DAYS;

            for (let i = gaps.length - 1; i >= 0 && daysRemaining > 0; i--) {
              const gap = gaps[i];
              const gapStart = new Date(gap.start);
              const gapEnd = new Date(gap.end);
              const gapDays =
                Math.ceil((gapEnd.getTime() - gapStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;

              if (gapDays <= daysRemaining) {
                trimmedGaps.unshift(gap);
                daysRemaining -= gapDays;
              } else {
                // Trim this gap to only include the most recent days
                const trimmedStart = new Date(gapEnd);
                trimmedStart.setDate(trimmedStart.getDate() - (daysRemaining - 1));
                trimmedGaps.unshift({
                  start: trimmedStart.toISOString().split('T')[0],
                  end: gap.end,
                });
                daysRemaining = 0;
              }
            }

            logger.info({ event: 'job.fill_missing.ga4.gaps_trimmed', pageId: page.id, originalGapDays: totalGapDays, trimmedTo: GA4_BACKFILL_MAX_RECENT_DAYS, originalRanges: gaps.length, trimmedRanges: trimmedGaps.length }, `Trimmed GA4 backfill from ${totalGapDays} to ${GA4_BACKFILL_MAX_RECENT_DAYS} most recent days for: ${page.name}`);
          }

          // Backfill each gap range (trimmed to recent days)
          const pagePath = new URL(page.url).pathname;
          for (const gap of trimmedGaps) {
            try {
              const ga4 = await getGa4Client();
              const metrics = await ga4.getMetricsForDateRange(
                pagePath,
                gap.start,
                gap.end
              );

              for (const [dateStr, dayMetrics] of metrics) {
                const [year, month, day] = dateStr.split('-').map(Number);
                const snapshotDate = new Date(year, month - 1, day);
                snapshotDate.setHours(0, 0, 0, 0);

                await prisma.performanceSnapshot.upsert({
                  where: {
                    pageId_date: {
                      pageId: page.id,
                      date: snapshotDate,
                    },
                  },
                  update: {
                    pageViews: dayMetrics.pageViews,
                    bounceRate: dayMetrics.bounceRate,
                    conversions: dayMetrics.conversions,
                    revenue: dayMetrics.revenue,
                    avgSessionDuration: dayMetrics.avgSessionDuration,
                    conversionRate:
                      dayMetrics.pageViews > 0
                        ? dayMetrics.conversions / dayMetrics.pageViews
                        : 0,
                    gaCollectedAt: new Date(),
                  },
                  create: {
                    pageId: page.id,
                    date: snapshotDate,
                    pageViews: dayMetrics.pageViews,
                    bounceRate: dayMetrics.bounceRate,
                    conversions: dayMetrics.conversions,
                    revenue: dayMetrics.revenue,
                    avgSessionDuration: dayMetrics.avgSessionDuration,
                    conversionRate:
                      dayMetrics.pageViews > 0
                        ? dayMetrics.conversions / dayMetrics.pageViews
                        : 0,
                    gaCollectedAt: new Date(),
                  },
                });

                pageFilled++;
              }

              // Fill zero-data snapshots for dates GA4 returned nothing for
              const zerosFilled = await upsertZeroDataSnapshots(
                page.id,
                gap.start,
                gap.end,
                metrics,
                { logger }
              );
              if (zerosFilled > 0) {
                logger.debug({ event: 'job.fill_missing.ga4.zeros_filled', pageId: page.id, gapStart: gap.start, gapEnd: gap.end, zerosFilled, realDataDays: metrics.size }, `Created ${zerosFilled} zero-data snapshots for gap ${gap.start} - ${gap.end}: ${page.name}`);
              }
            } catch (error) {
              logger.error({ event: 'job.fill_missing.ga4.gap_range.failed', err: error as Error, pageId: page.id, gapStart: gap.start, gapEnd: gap.end }, `Failed to backfill GA4 gap ${gap.start} - ${gap.end} for: ${page.name}`);
            }
          }
        } catch (error) {
          logger.error({ event: 'job.fill_missing.ga4.page.failed', err: error as Error, pageId: page.id }, `Failed GA4 gap detection for: ${page.name}`);
        }
        return pageFilled;
      })
    )
  );

  ga4GapsFilled = backfillResults.reduce((sum, count) => sum + count, 0);

  if (ga4GapsFilled > 0) {
    logger.info({ event: 'job.fill_missing.ga4.completed', ga4GapsFilled }, `Filled ${ga4GapsFilled} missing GA4 snapshot days`);
  }

  // === NetDonor Retry (pages with campaignId but null fundraising data) ===
  let netDonorRetried = 0;

  if (await isENPublicConfiguredAsync()) {
    const pagesNeedingNetDonor = pages.filter(
      (p) => p.campaignId && p.fundraisingTotalDonated === null
    );

    const retryLimit = pLimit(FILL_MISSING_RETRY_CONCURRENCY);
    const results = await Promise.all(
      pagesNeedingNetDonor.map((page) =>
        retryLimit(async () => {
          try {
            const result = await collectNetDonorData(page, { logger });
            if (result.success) {
              logger.info({ event: 'job.fill_missing.netdonor.retried', pageId: page.id, campaignId: page.campaignId }, `Retried NetDonor successfully for: ${page.name}`);
              return true;
            }
          } catch (error) {
            logger.error({ event: 'job.fill_missing.netdonor.failed', err: error as Error, pageId: page.id }, `Failed NetDonor retry for: ${page.name}`);
          }
          return false;
        })
      )
    );
    netDonorRetried = results.filter(Boolean).length;
  }

  // === FundraisingSnapshot Retry (missing period snapshots) ===
  let snapshotsRetried = 0;

  if (await isENPublicConfiguredAsync()) {
    const allPeriodTypes: PeriodType[] = [
      'LAST_7_DAYS',
      'PREV_7_DAYS',
      'LAST_30_DAYS',
      'LIFETIME',
    ];
    const pagesWithCampaigns = pages.filter((p) => p.campaignId && p.enPageId);

    const retryLimit = pLimit(FILL_MISSING_RETRY_CONCURRENCY);
    const counts = await Promise.all(
      pagesWithCampaigns.map((page) =>
        retryLimit(async () => {
          try {
            const existingSnapshots = await prisma.fundraisingSnapshot.findMany({
              where: { pageId: page.id },
              orderBy: { fetchedAt: 'desc' },
              distinct: ['periodType'],
              select: { periodType: true },
            });
            const existingTypes = new Set(existingSnapshots.map((s) => s.periodType));

            const missingTypes = allPeriodTypes.filter((t) => !existingTypes.has(t));
            if (missingTypes.length === 0) return 0;

            logger.info({ event: 'job.fill_missing.snapshots.detected', pageId: page.id, missingTypes }, `Found ${missingTypes.length} missing fundraising periods for: ${page.name}`);

            const result = await collectFundraisingSnapshots(page, { logger });
            return result.success ? result.periodsCollected : 0;
          } catch (error) {
            logger.error({ event: 'job.fill_missing.snapshots.failed', err: error as Error, pageId: page.id }, `Failed snapshot retry for: ${page.name}`);
            return 0;
          }
        })
      )
    );
    snapshotsRetried = counts.reduce((sum, n) => sum + n, 0);
  }

  // === Content gap fill (parallelized, single Playwright nav per page) ===
  const contentLimit = pLimit(FILL_MISSING_CONTENT_CONCURRENCY);
  let processedSoFar = 0;

  const fillResults = await Promise.all(
    pages.map((page) =>
      contentLimit(async () => {
        let didUpdate = false;
        try {
          const latestSnapshot = await prisma.contentSnapshot.findFirst({
            where: { pageId: page.id },
            orderBy: { enModifiedAt: 'desc' },
          });

          if (!latestSnapshot) return false;

          const missing: string[] = [];
          if (
            depth.screenshots &&
            (!latestSnapshot.screenshotUrl || !latestSnapshot.mobileScreenshotUrl)
          ) {
            missing.push('screenshots');
          }
          if (depth.consoleErrors && !latestSnapshot.diagnostics) {
            missing.push('consoleErrors');
          }
          if (
            depth.pageContent &&
            ((!latestSnapshot.metaTitle && !latestSnapshot.appealText) || !latestSnapshot.rawHtml)
          ) {
            missing.push('pageContent');
          }

          if (missing.length === 0) return false;

          const url = getScrapableUrl(page);
          if (!url || !isScrapeable(page.campaignStatus)) return false;

          const needs = {
            desktopShot: missing.includes('screenshots'),
            mobileShot: missing.includes('screenshots'),
            diagnostics: missing.includes('consoleErrors'),
            html: missing.includes('pageContent'),
          };

          // Single Playwright nav covers all of: desktop+mobile screenshots,
          // diagnostics, and HTML. Replaces up to 4 separate browser trips.
          const bundle = await capturePageBundle(url, needs, { timeoutMs: 30000 });

          const updateData: Record<string, unknown> = {};

          if (bundle.desktopScreenshot) {
            updateData.screenshotUrl = await uploadScreenshot(page.id, bundle.desktopScreenshot, 'desktop');
          }
          if (bundle.mobileScreenshot) {
            updateData.mobileScreenshotUrl = await uploadScreenshot(page.id, bundle.mobileScreenshot, 'mobile');
          }
          if (bundle.diagnostics) {
            updateData.diagnostics = JSON.parse(JSON.stringify(bundle.diagnostics));
          }
          if (bundle.html) {
            const parsed = scraper.parseHtml(url, bundle.html, {
              runtimeGateway: bundle.runtimeGateway ?? null,
              runtimeENData: bundle.enRuntimeRaw ?? null,
              usedPlaywright: true,
            });
            updateData.metaTitle = parsed.metaTitle ?? null;
            updateData.appealText = parsed.appealText ?? null;
            updateData.narrativeText = parsed.narrativeText ?? null;
            updateData.rawHtml = parsed.rawHtml ?? null;
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.contentSnapshot.update({
              where: { id: latestSnapshot.id },
              data: updateData,
            });
            didUpdate = true;
          }
        } catch (error) {
          logger.error({ event: 'job.fill_missing.page.failed', err: error as Error, pageId: page.id }, `Failed to fill gaps for ${page.name}`);
        } finally {
          processedSoFar++;
          // FILLING_MISSING owns progress 60-80. Updating both processedPages
          // and progress refreshes job.updatedAt and prevents the dashboard's
          // stuck detector from firing.
          await prisma.collectionJob.update({
            where: { id: job.id },
            data: {
              processedPages: { increment: 1 },
              progress: 60 + Math.round((processedSoFar / Math.max(pages.length, 1)) * 20),
            },
          }).catch(() => {});
        }
        return didUpdate;
      })
    )
  );

  filled = fillResults.filter(Boolean).length;

  const totalFilled = filled + ga4GapsFilled + netDonorRetried + snapshotsRetried;
  jobLogger.phaseCompleted('FILLING_MISSING', totalFilled, 0, 0);

  const summary = `Filled: ${filled} content, ${ga4GapsFilled} GA4 days, ${netDonorRetried} NetDonor, ${snapshotsRetried} snapshots`;

  // Move to next phase
  const nextPhase = await getNextEnabledPhase('FILLING_MISSING', job.jobType);
  if (!nextPhase) {
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
    });
    return { done: true, progress: 100, message: `${summary}, job complete` };
  }

  const nextProgress = getPhaseStartProgress(nextPhase);
  await prisma.collectionJob.update({
    where: { id: job.id },
    data: { phase: nextPhase, progress: nextProgress, processedPages: 0 },
  });
  jobLogger.phaseTransition('FILLING_MISSING', nextPhase);
  return { done: false, progress: nextProgress, message: `${summary}, moving to ${nextPhase}` };
}
