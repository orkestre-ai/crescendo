import type { Logger } from 'pino';
import type { CollectionJob, FundraisingPage } from '@prisma/client';
import { prisma } from '../../db';
import { scraper } from '../../scraper';
import { refreshScraperTrustedHostsFromDb } from '../../scraper-trust';
import { computeContentHash } from '../../content-hash';
import { getScrapableUrl, isScrapeable } from '../../url-utils';
import { getScrapingSettings } from '../../settings';
import { DEEP_SCAN_CONCURRENCY } from '@/config/constants';
import { CloudflareBlockedError } from '../../errors';
import { createJobLogger } from '@/lib/logging/journeys';
import { createSnapshotWithLifetime } from '../helpers/snapshots';
import {
  getNextEnabledPhase,
  getPhaseStartProgress,
} from '../phase-routing';
import { env } from '@/config/env';
import type { PhaseResult } from './types';

export async function processScrapingPhase(
  job: CollectionJob,
  deps: { logger: Logger }
): Promise<PhaseResult> {
  const { logger } = deps;
  const jobLogger = createJobLogger(job.id, job.jobType);
  const phaseStart = performance.now();

  // Get scraping settings
  const scrapingSettings = await getScrapingSettings();

  // Check scraping enabled — skip cron-triggered jobs when disabled
  if (!scrapingSettings.enabled && job.triggeredBy === 'cron') {
    logger.info({ event: 'job.scraping.disabled', jobId: job.id, }, 'Scraping is disabled, skipping cron-triggered scrape');

    // Move to next enabled phase
    const nextPhase = await getNextEnabledPhase('SCRAPING', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'Scraping disabled, job complete (no more phases)',
      };
    }

    const nextProgress = getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress, processedPages: 0 },
    });
    jobLogger.phaseTransition('SCRAPING', nextPhase);
    return {
      done: false,
      progress: nextProgress,
      message: `Scraping is disabled, moving to ${nextPhase}`,
    };
  }

  // Log phase start
  if (job.processedPages === 0) {
    jobLogger.phaseStarted('SCRAPING', job.totalPages);
  }

  // Build where clause - single page or all active pages
  const whereClause = job.targetPageId ? { id: job.targetPageId } : { status: 'ACTIVE' as const };

  // Get pages that need scraping
  // Determine scrape strategy:
  // Smart scan: only scrape new or modified pages (for SYNC jobs)
  // Single page: scrape the target page
  let pages: FundraisingPage[];

  const debugLimit = env.SYNC_DEBUG_LIMIT;
  const thresholdDays = scrapingSettings.stalenessThresholdDays;

  if (!job.targetPageId && debugLimit > 0) {
    // Debug mode: select from the top-N most recently modified pages (consistent
    // with COLLECTING), then filter for those that actually need scraping using
    // four-signal OR: never scraped, no hash, stale, EN modified.
    const remaining = debugLimit - job.processedPages;
    pages =
      remaining > 0
        ? await prisma.$queryRaw<FundraisingPage[]>`
            SELECT * FROM (
              SELECT * FROM "FundraisingPage"
              WHERE status = 'ACTIVE'
              ORDER BY "enModifiedAt" DESC NULLS LAST
              LIMIT ${debugLimit}
            ) AS debug_pages
            WHERE "lastScrapedAt" IS NULL
               OR "contentHash" IS NULL
               OR "lastScrapedAt" < NOW() - INTERVAL '1 day' * ${thresholdDays}
               OR ("enModifiedAt" IS NOT NULL AND "lastScrapedAt" < "enModifiedAt")
            ORDER BY "lastScrapedAt" ASC NULLS FIRST
            OFFSET ${job.processedPages}
            LIMIT ${remaining}
          `
        : [];
  } else if (!job.targetPageId) {
    // Smart scan: four-signal OR — never scraped, no hash, stale, EN modified
    pages = await prisma.$queryRaw<FundraisingPage[]>`
        SELECT * FROM "FundraisingPage"
        WHERE status = 'ACTIVE'
        AND (
          "lastScrapedAt" IS NULL
          OR "contentHash" IS NULL
          OR "lastScrapedAt" < NOW() - INTERVAL '1 day' * ${thresholdDays}
          OR ("enModifiedAt" IS NOT NULL AND "lastScrapedAt" < "enModifiedAt")
        )
        ORDER BY "lastScrapedAt" ASC NULLS FIRST
        OFFSET ${job.processedPages}
      `;
  } else {
    pages = await prisma.fundraisingPage.findMany({
      where: whereClause,
      skip: job.processedPages,
    });
  }

  if (pages.length === 0) {
    // Clean up Playwright browser if it was launched during earlier scraping chunks
    await scraper.cleanup();

    const phaseDuration = performance.now() - phaseStart;
    const errorCount =
      (job.errors as any[])?.filter((e: any) => e.phase === 'SCRAPING').length || 0;
    jobLogger.phaseCompleted('SCRAPING', job.processedPages, errorCount, phaseDuration);

    // Move to next enabled phase
    const nextPhase = await getNextEnabledPhase('SCRAPING', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'Scraping complete, job finished (no more phases)',
      };
    }

    const nextProgress = getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress, processedPages: 0 },
    });
    jobLogger.phaseTransition('SCRAPING', nextPhase);
    return {
      done: false,
      progress: nextProgress,
      message: `Scraping complete, moving to ${nextPhase}`,
    };
  }

  // Refresh the scraper's trusted-host allowlist from synced page URLs so
  // CNAMEd EN domains (e.g. secured.oxfam.ca) are scrapeable.
  await refreshScraperTrustedHostsFromDb();

  // Process pages in the chunk
  let errorCount = 0;
  let cfBlockedCount = 0;
  let processedInChunk = 0;

  if (!job.targetPageId && pages.length > 1) {
    // Parallel scraping for multi-page SYNC jobs using p-limit
    const pageInputs = pages.map((p) => ({
      url: getScrapableUrl(p),
      requiresPlaywright: p.requiresPlaywright,
    }));

    const results = await scraper.scrapePagesParallel(
      pageInputs,
      { ...scrapingSettings, concurrency: DEEP_SCAN_CONCURRENCY },
      async (_url, _result) => {
        processedInChunk++;
        await prisma.collectionJob.update({
          where: { id: job.id },
          data: {
            processedPages: { increment: 1 },
            progress:
              10 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 20),
          },
        });
      }
    );

    // Process results — update page records with content hash lifecycle
    for (const page of pages) {
      const content = results.get(getScrapableUrl(page));
      if (content && !content.scrapeFailed) {
        // Compute content hash from key user-facing fields (per D-01)
        const newHash = computeContentHash({
          h1: content.h1,
          metaDescription: content.metaDescription,
          metaTitle: content.metaTitle ?? null,
          appealText: content.appealText ?? null,
          narrativeText: content.narrativeText ?? null,
          ctaButtons: content.cta,
          donationAmounts: content.donationAmounts,
          monthlyDonationAmounts: content.monthlyDonationAmounts ?? [],
        });

        const contentChanged = newHash !== page.contentHash;

        await prisma.fundraisingPage.update({
          where: { id: page.id },
          data: {
            headline: content.h1,
            metaDescription: content.metaDescription,
            ctaButtons: content.cta,
            donationAmounts: content.donationAmounts,
            lastScrapedAt: content.scrapedAt,
            narrativeText: content.narrativeText,
            metaTitle: content.metaTitle,
            appealText: content.appealText,
            pageNumber: content.pageNumber,
            pageCount: content.pageCount,
            redirectPresent: content.redirectPresent,
            giftProcess: content.giftProcess,
            // EN runtime fields
            monthlyDonationAmounts: content.monthlyDonationAmounts ?? [],
            hasFeeCover: content.hasFeeCover ?? false,
            ...(content.feeCoverConfig != null
              ? { feeCoverConfig: JSON.parse(JSON.stringify(content.feeCoverConfig)) }
              : {}),
            hasMonthlyGiving: content.hasMonthlyGiving ?? false,
            ...(content.currency !== undefined ? { currency: content.currency } : {}),
            ...(content.minDonationAmount !== undefined
              ? { minDonationAmount: content.minDonationAmount }
              : {}),
            ...(content.enRuntimeConfig != null
              ? { enRuntimeConfig: JSON.parse(JSON.stringify(content.enRuntimeConfig)) }
              : {}),
            ...(content.usedPlaywright !== undefined
              ? { requiresPlaywright: content.usedPlaywright }
              : {}),
            ...(content.paymentGateway != null
              ? { paymentGateway: JSON.parse(JSON.stringify(content.paymentGateway)) }
              : {}),
            // Always update contentHash for comparison on next scrape
            contentHash: newHash,
          },
        });

        // Create content snapshot only if content actually changed (per D-12, D-13)
        if (contentChanged) {
          await createSnapshotWithLifetime(page, newHash, content, scrapingSettings, { logger });
        } else if (content.rawHtml) {
          // Hash unchanged but the existing snapshot may pre-date rawHtml capture.
          const result = await prisma.contentSnapshot.updateMany({
            where: { pageId: page.id, contentHash: newHash, rawHtml: null },
            data: { rawHtml: content.rawHtml },
          });
          if (result.count > 0) {
            logger.info(
              {
                event: 'snapshot.rawhtml.backfilled',
                pageId: page.id,
                contentHash: newHash.substring(0, 12),
                count: result.count,
              },
              `Backfilled rawHtml on existing snapshot for ${page.name}`
            );
          }
        }

        jobLogger.pageProcessed(page.id, page.name, 0);
      } else {
        errorCount++;
        jobLogger.pageFailed(page.id, page.name, 'scraping failed');
      }
    }
  } else {
    // Sequential scraping (single-page jobs or small batches)
    for (const page of pages) {
      const pageStart = performance.now();
      try {
        await scrapePageContent(page, scrapingSettings, logger);

        const pageDuration = performance.now() - pageStart;
        jobLogger.pageProcessed(page.id, page.name, pageDuration);

        processedInChunk++;
        await prisma.collectionJob.update({
          where: { id: job.id },
          data: {
            processedPages: { increment: 1 },
            progress:
              10 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 20), // 10-30% for scraping
          },
        });
      } catch (error) {
        if (error instanceof CloudflareBlockedError) {
          // Cloudflare blocks are not errors — skip gracefully like non-scrapeable pages
          cfBlockedCount++;
          processedInChunk++;
          const pageDuration = performance.now() - pageStart;
          jobLogger.pageProcessed(page.id, page.name, pageDuration);

          logger.info({ event: 'page.scrape.skipped.cloudflare', pageId: page.id, pageName: page.name, url: page.url }, `Skipping page (Cloudflare blocked both axios and Playwright): ${page.name}`);

          // Still update progress, but do NOT increment errorCount or push to errors array
          await prisma.collectionJob.update({
            where: { id: job.id },
            data: {
              processedPages: { increment: 1 },
              progress:
                10 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 20),
            },
          });
          continue;
        }

        // Real scraping error
        errorCount++;
        processedInChunk++;
        jobLogger.pageFailed(page.id, page.name, 'processing failed');

        logger.error({ event: 'job.page.scraping.failed', err: error as Error, pageId: page.id, pageName: page.name }, `Failed to scrape page ${page.id}`);

        await prisma.collectionJob.update({
          where: { id: job.id },
          data: {
            processedPages: { increment: 1 },
            progress:
              10 + Math.round(((job.processedPages + processedInChunk) / job.totalPages) * 20), // Update progress even on error
            errors: {
              push: {
                page: page.id,
                phase: 'SCRAPING',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
              },
            },
          },
        });
      }
    }
  } // end else (sequential scraping)

  // For debug jobs: complete after this phase
  if (job.targetPageId) {
    // Clean up Playwright browser if it was launched during scraping
    await scraper.cleanup();

    const phaseDuration = performance.now() - phaseStart;
    jobLogger.phaseCompleted('SCRAPING', 1, errorCount, phaseDuration);
    if (cfBlockedCount > 0) {
      logger.info({ event: 'job.phase.scraping.cloudflare_summary', cfBlockedCount }, `${cfBlockedCount} page(s) skipped due to Cloudflare challenge`);
    }

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
          ? 'Scraping completed with errors for this page.'
          : 'Scraping complete for this page.',
    };
  }

  const updatedJob = await prisma.collectionJob.findUnique({
    where: { id: job.id },
  });

  if (updatedJob && updatedJob.processedPages >= updatedJob.totalPages) {
    // Clean up Playwright browser if it was launched during scraping
    await scraper.cleanup();

    const phaseDuration = performance.now() - phaseStart;
    const totalErrors =
      (updatedJob.errors as any[])?.filter((e: any) => e.phase === 'SCRAPING').length || 0;
    jobLogger.phaseCompleted('SCRAPING', updatedJob.processedPages, totalErrors, phaseDuration);
    if (cfBlockedCount > 0) {
      logger.info({ event: 'job.phase.scraping.cloudflare_summary', cfBlockedCount }, `${cfBlockedCount} page(s) skipped due to Cloudflare challenge`);
    }

    // Move to next enabled phase
    const nextPhase = await getNextEnabledPhase('SCRAPING', job.jobType);
    if (!nextPhase) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      return {
        done: true,
        progress: 100,
        message: 'Scraping complete, job finished (no more phases)',
      };
    }

    const nextProgress = getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { phase: nextPhase, progress: nextProgress, processedPages: 0 },
    });
    jobLogger.phaseTransition('SCRAPING', nextPhase);
    return {
      done: false,
      progress: nextProgress,
      message: `Scraping complete, moving to ${nextPhase}`,
    };
  }

  return {
    done: false,
    progress: updatedJob?.progress || 10,
    message: `Scraped ${updatedJob?.processedPages} of ${updatedJob?.totalPages} pages`,
  };
}

async function scrapePageContent(
  page: FundraisingPage,
  settings: Awaited<ReturnType<typeof getScrapingSettings>>,
  logger: Logger
): Promise<void> {
  // Skip pages that aren't in a scrapeable state (only new, live, tested)
  if (!isScrapeable(page.campaignStatus)) {
    logger.info({ event: 'page.scrape.skipped.status', enPageId: page.enPageId,
      campaignStatus: page.campaignStatus, }, `Skipping non-scrapeable page: ${page.name}`);
    return;
  }

  // Scrape page content with configured options
  const scrapedContent = await scraper.scrapePage(getScrapableUrl(page), {
    timeoutMs: settings.timeoutMs,
  });

  // Compute content hash from key user-facing fields (per D-01)
  const newHash = computeContentHash({
    h1: scrapedContent.h1,
    metaDescription: scrapedContent.metaDescription,
    metaTitle: scrapedContent.metaTitle ?? null,
    appealText: scrapedContent.appealText ?? null,
    narrativeText: scrapedContent.narrativeText ?? null,
    ctaButtons: scrapedContent.cta,
    donationAmounts: scrapedContent.donationAmounts,
    monthlyDonationAmounts: scrapedContent.monthlyDonationAmounts ?? [],
  });

  const contentChanged = newHash !== page.contentHash;

  // Update page with scraped content + always update lastScrapedAt + contentHash (per D-11)
  await prisma.fundraisingPage.update({
    where: { id: page.id },
    data: {
      headline: scrapedContent.h1,
      metaDescription: scrapedContent.metaDescription,
      ctaButtons: scrapedContent.cta,
      donationAmounts: scrapedContent.donationAmounts,
      lastScrapedAt: scrapedContent.scrapedAt,
      narrativeText: scrapedContent.narrativeText,
      metaTitle: scrapedContent.metaTitle,
      appealText: scrapedContent.appealText,
      // Page flow metadata from pageJson
      pageNumber: scrapedContent.pageNumber,
      pageCount: scrapedContent.pageCount,
      redirectPresent: scrapedContent.redirectPresent,
      giftProcess: scrapedContent.giftProcess,
      // EN runtime fields
      monthlyDonationAmounts: scrapedContent.monthlyDonationAmounts ?? [],
      hasFeeCover: scrapedContent.hasFeeCover ?? false,
      ...(scrapedContent.feeCoverConfig != null
        ? { feeCoverConfig: JSON.parse(JSON.stringify(scrapedContent.feeCoverConfig)) }
        : {}),
      hasMonthlyGiving: scrapedContent.hasMonthlyGiving ?? false,
      ...(scrapedContent.currency !== undefined ? { currency: scrapedContent.currency } : {}),
      ...(scrapedContent.minDonationAmount !== undefined
        ? { minDonationAmount: scrapedContent.minDonationAmount }
        : {}),
      ...(scrapedContent.enRuntimeConfig != null
        ? { enRuntimeConfig: JSON.parse(JSON.stringify(scrapedContent.enRuntimeConfig)) }
        : {}),
      // Track whether Playwright was needed (for Cloudflare route optimization)
      ...(scrapedContent.usedPlaywright !== undefined
        ? { requiresPlaywright: scrapedContent.usedPlaywright }
        : {}),
      // Payment gateway detection — only update if we got a result
      ...(scrapedContent.paymentGateway != null
        ? { paymentGateway: JSON.parse(JSON.stringify(scrapedContent.paymentGateway)) }
        : {}),
      // Always update contentHash for comparison on next scrape
      contentHash: newHash,
    },
  });

  // Create content snapshot only if content actually changed (per D-12, D-13)
  if (contentChanged) {
    await createSnapshotWithLifetime(page, newHash, scrapedContent, settings, { logger });
  } else {
    logger.debug({ event: 'page.scrape.unchanged', enPageId: page.enPageId,
      contentHash: newHash, }, `Content unchanged for ${page.name}`);

    // Backfill rawHtml on the existing snapshot if it predates rawHtml capture.
    // Hash is identical, so this fills a gap rather than mutating history.
    if (scrapedContent.rawHtml) {
      const result = await prisma.contentSnapshot.updateMany({
        where: { pageId: page.id, contentHash: newHash, rawHtml: null },
        data: { rawHtml: scrapedContent.rawHtml },
      });
      if (result.count > 0) {
        logger.info(
          {
            event: 'snapshot.rawhtml.backfilled',
            pageId: page.id,
            contentHash: newHash.substring(0, 12),
            count: result.count,
          },
          `Backfilled rawHtml on existing snapshot for ${page.name}`
        );
      }
    }
  }

  logger.debug({ event: 'page.scraped', enPageId: page.enPageId,
    contentChanged,
    contentHash: newHash.substring(0, 12),
    hasH1: !!scrapedContent.h1,
    hasMeta: !!scrapedContent.metaDescription,
    ctaCount: scrapedContent.cta.length,
    amountCount: scrapedContent.donationAmounts.length,
    monthlyAmountCount: scrapedContent.monthlyDonationAmounts?.length ?? 0,
    hasFeeCover: scrapedContent.hasFeeCover ?? false,
    hasMonthlyGiving: scrapedContent.hasMonthlyGiving ?? false, }, `Scraped page: ${page.name}`);
}
