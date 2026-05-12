import type { Logger } from 'pino';
import type { CollectionJob } from '@prisma/client';
import { prisma } from '../../db';
import { enClient, getENRestClientAsync } from '../../engaging-networks';
import { getSyncBehavior } from '../../settings';
import { SYNC_PAGE_LIMIT } from '@/config/constants';
import { env } from '@/config/env';
import { createJobLogger } from '@/lib/logging/journeys';
import { determinePageStatus } from '../helpers/page-status';
import { getNextEnabledPhase, getPhaseStartProgress } from '../phase-routing';
import type { PhaseResult } from './types';

export async function processSyncPhase(
  job: CollectionJob,
  deps: { logger: Logger }
): Promise<PhaseResult> {
  const { logger } = deps;
  const jobLogger = createJobLogger(job.id, job.jobType);
  const phaseStart = performance.now();

  try {
    // Single-page debug mode: sync only the target page and complete
    if (job.targetPageId) {
      const result = await syncSinglePageFromEN(job.id, job.targetPageId, logger);

      // Complete the job after this single phase (debug mode)
      const phaseDuration = performance.now() - phaseStart;
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          status: result.error ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
          progress: 100,
          processedPages: 1,
          completedAt: new Date(),
        },
      });

      jobLogger.completed(1, result.error ? 1 : 0, phaseDuration);

      return {
        done: true,
        progress: 100,
        message: result.error ? `Sync failed: ${result.error}` : 'Single page sync complete.',
      };
    }

    // Full sync mode: sync all pages from EN
    const results = await syncPagesFromEN(job.id, logger);

    // Update total pages count after sync (respecting debug limit)
    const debugLimit = env.SYNC_DEBUG_LIMIT;
    const activeCount = await prisma.fundraisingPage.count({
      where: { status: 'ACTIVE' },
    });
    const totalPages = debugLimit > 0 ? Math.min(debugLimit, activeCount) : activeCount;

    // Move to next enabled phase
    const nextPhase = await getNextEnabledPhase('SYNCING', job.jobType);

    if (!nextPhase) {
      // No more enabled phases, complete the job
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          totalPages,
          progress: 100,
          completedAt: new Date(),
        },
      });

      return {
        done: true,
        progress: 100,
        message: `Sync complete: ${results.discovered} new, ${results.updated} updated, ${results.paused} paused. (Remaining phases disabled)`,
      };
    }

    const nextProgress = getPhaseStartProgress(nextPhase);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        phase: nextPhase,
        totalPages,
        progress: nextProgress,
        processedPages: 0,
      },
    });

    jobLogger.phaseTransition('SYNCING', nextPhase);

    return {
      done: false,
      progress: nextProgress,
      message: `Sync complete: ${results.discovered} new, ${results.updated} updated, ${results.paused} paused. Moving to ${nextPhase}.`,
    };
  } catch (error) {
    const phaseDuration = performance.now() - phaseStart;
    jobLogger.phaseCompleted('SYNCING', 0, 1, phaseDuration);
    throw error;
  }
}

// Internal helpers — only used by processSyncPhase.

async function syncPagesFromEN(
  jobId: string,
  logger: Logger
): Promise<{
  discovered: number;
  updated: number;
  paused: number;
}> {
  const jobLogger = createJobLogger(jobId);
  const restClient = await getENRestClientAsync() ?? enClient;
  const debugLimit = env.SYNC_DEBUG_LIMIT;
  const syncBehavior = await getSyncBehavior();
  const includeNonLive = syncBehavior.includeNonLive;
  jobLogger.phaseStarted('SYNCING', 0);

  let discovered = 0;
  let updated = 0;
  let offset = 0;
  let hasMore = true;
  let loopCount = 0;
  const maxLoops = 50; // Safety limit: max 50 * 100 = 5000 pages
  const enPageIds = new Set<string>();

  logger.info({ event: 'job.sync.started' }, `Starting EN page sync for job ${jobId}`);

  // Fetch all live fundraising pages from EN (nd = NetDonor)
  while (hasMore && loopCount < maxLoops) {
    loopCount++;
    const loopStart = Date.now();

    logger.debug({ event: 'job.sync.api.call', jobId,
      offset,
      limit: SYNC_PAGE_LIMIT,
      loopCount, }, `Fetching EN pages (loop ${loopCount})`);

    let pages;
    try {
      // Note: EN API doesn't return status/url in list endpoint, so we sync all pages
      pages = await restClient.getPages({
        type: 'nd',
        status: '', // Empty = all statuses (EN doesn't return status in list anyway)
        limit: SYNC_PAGE_LIMIT,
        offset,
      });
    } catch (error) {
      logger.error({ event: 'job.sync.api.failed', err: error as Error, jobId, offset, loopCount }, `EN API call failed at offset ${offset}`);
      throw error;
    }

    const apiDuration = Date.now() - loopStart;
    logger.info({ event: 'job.sync.api.response', jobId, pagesReturned: pages.length, offset, duration: apiDuration, loopCount }, `EN API returned ${pages.length} pages in ${apiDuration}ms`);

    if (pages.length === 0) {
      logger.info({ event: 'job.sync.complete', jobId,
        loopCount,
        totalProcessed: offset, }, `No more pages returned from EN`);
      break;
    }

    for (const enPage of pages) {
      // Debug limit: stop before fetching details for pages beyond the limit
      if (debugLimit > 0 && enPageIds.size >= debugLimit) {
        logger.info({ event: 'job.sync.debug_limit', jobId,
          limit: debugLimit,
          totalDiscovered: enPageIds.size,
          synced: discovered + updated, }, `Debug limit reached`);
        break;
      }

      // Convert ID to string (EN returns integers, DB expects strings)
      const pageId = String(enPage.id);

      enPageIds.add(pageId);

      const existingPage = await prisma.fundraisingPage.findUnique({
        where: { enPageId: pageId },
      });

      // Fetch full page details from EN
      let pageDetails;
      try {
        pageDetails = await restClient.getPage(pageId);
        logger.debug({ event: 'job.sync.page.details', jobId,
          enPageId: pageId,
          subType: pageDetails.subType,
          campaignStatus: pageDetails.campaignStatus, }, `Fetched details for: ${enPage.name}`);
      } catch (error) {
        logger.warn({ event: 'job.sync.page.details.failed', jobId, enPageId: pageId, error: error instanceof Error ? error.message : 'Unknown error' }, `Failed to get details for ${enPage.name}`);
        // Continue with basic info if details fetch fails
        pageDetails = null;
      }

      // Build the public URL from EN's campaignBaseUrl (CNAME → EN infra).
      // Scraping the EN admin host (ca.engagingnetworks.app) returns ~48 bytes
      // of placeholder HTML, so the only URL that yields real content is the
      // customer-facing one. scraper-trust.ts trusts hosts found in this field
      // dynamically, so custom domains (e.g. secured.oxfam.ca) work without
      // operator config.
      if (!pageDetails?.campaignBaseUrl) {
        logger.warn(
          {
            event: 'job.sync.page.no_base_url',
            jobId,
            enPageId: pageId,
            hadDetails: !!pageDetails,
          },
          `Skipping ${enPage.name}: no campaignBaseUrl from EN`
        );
        continue;
      }
      const pageUrl = `${pageDetails.campaignBaseUrl}/page/${pageId}/donate/1`;

      const pageData = {
        name: enPage.name,
        url: pageUrl,
        enPageType: enPage.type,
        status: determinePageStatus(pageDetails?.campaignStatus, includeNonLive),
        lastSyncStatus: 'SUCCESS' as const, // This sync succeeded
        lastSyncedAt: new Date(),
        // EN page details (if available)
        ...(pageDetails && {
          title: pageDetails.title,
          campaignId: pageDetails.campaignId,
          subType: pageDetails.subType,
          clientId: pageDetails.clientId,
          campaignBaseUrl: pageDetails.campaignBaseUrl,
          campaignStatus: pageDetails.campaignStatus?.toLowerCase() ?? null,
          defaultLocale: pageDetails.defaultLocale,
          template: pageDetails.template,
          trackingParameters: pageDetails.trackingParameters || [],
          enCreatedAt: new Date(pageDetails.createdOn),
          enModifiedAt: new Date(pageDetails.modifiedOn),
        }),
      };

      if (existingPage) {
        // Check if page was modified in EN since last sync
        const wasModified =
          pageDetails && existingPage.enModifiedAt
            ? new Date(pageDetails.modifiedOn).getTime() > existingPage.enModifiedAt.getTime()
            : true;

        if (wasModified || !existingPage.lastSyncedAt) {
          await prisma.fundraisingPage.update({
            where: { enPageId: pageId },
            data: pageData,
          });
          updated++;
          logger.debug({ event: 'job.sync.page.updated', jobId, enPageId: pageId }, `Updated: ${enPage.name}${wasModified ? ' (modified in EN)' : ''}`);
        } else {
          // Page unchanged in EN — still re-evaluate status based on current settings
          const newStatus = determinePageStatus(pageDetails?.campaignStatus, includeNonLive);
          if (existingPage.status !== newStatus) {
            await prisma.fundraisingPage.update({
              where: { enPageId: pageId },
              data: { status: newStatus },
            });
            updated++;
            logger.debug({ event: 'job.sync.page.status_changed', jobId,
              enPageId: pageId, oldStatus: existingPage.status, newStatus, }, `Status changed: ${enPage.name} (${existingPage.status} → ${newStatus})`);
          } else {
            logger.debug({ event: 'job.sync.page.unchanged', jobId,
              enPageId: pageId, }, `Skipped: ${enPage.name} (unchanged)`);
          }
        }
      } else {
        // Create new page
        await prisma.fundraisingPage.create({
          data: {
            enPageId: pageId,
            pageType: 'donation',
            ...pageData,
          },
        });
        discovered++;
        logger.info({ event: 'job.sync.page.discovered', jobId,
          enPageId: pageId,
          subType: pageDetails?.subType, }, `Discovered: ${enPage.name}`);
      }
    }

    // Break outer loop if debug limit was reached inside the inner loop
    if (debugLimit > 0 && enPageIds.size >= debugLimit) {
      break;
    }

    hasMore = pages.length === SYNC_PAGE_LIMIT;
    offset += SYNC_PAGE_LIMIT;

    logger.debug({ event: 'job.sync.loop.complete', jobId,
      discovered,
      updated,
      hasMore,
      nextOffset: offset, }, `Completed loop ${loopCount}`);
  }

  if (loopCount >= maxLoops) {
    logger.warn({ event: 'job.sync.max.loops', jobId,
      totalPages: enPageIds.size,
      discovered,
      updated, }, `Hit maximum loop limit (${maxLoops})`);
  }

  // Mark pages not in EN as PAUSED (skip when debug-limited to avoid pausing real pages)
  let paused = 0;
  if (debugLimit > 0) {
    logger.debug({ event: 'job.sync.pausing.skipped', jobId,
      debugLimit, }, `Skipping pause check (debug limit active)`);
  } else {
    logger.debug({ event: 'job.sync.pausing.check', jobId,
      totalEnPages: enPageIds.size, }, `Checking for pages to pause`);

    const pauseResult = await prisma.fundraisingPage.updateMany({
      where: {
        status: 'ACTIVE',
        enPageId: { notIn: Array.from(enPageIds) },
      },
      data: { status: 'PAUSED' },
    });
    paused = pauseResult.count;

    if (paused > 0) {
      logger.info({ event: 'job.sync.pages.paused', jobId, pausedCount: paused }, `Marked ${paused} pages as PAUSED (no longer live in EN)`);
    }
  }

  logger.info({ event: 'job.sync.summary', jobId,
    discovered,
    updated,
    paused,
    totalEnPages: enPageIds.size,
    loopCount, }, `EN sync complete`);

  jobLogger.phaseCompleted('SYNCING', discovered + updated, 0, 0);

  return { discovered, updated, paused };
}

/**
 * Sync a single page from EN API (for debug mode)
 * Fetches the page details and updates the local database record
 */
async function syncSinglePageFromEN(
  jobId: string,
  pageId: string,
  logger: Logger
): Promise<{
  updated: boolean;
  error?: string;
}> {
  const jobLogger = createJobLogger(jobId);
  const restClient = await getENRestClientAsync() ?? enClient;
  jobLogger.phaseStarted('SYNCING', 1);
  const syncBehavior = await getSyncBehavior();
  const includeNonLive = syncBehavior.includeNonLive;

  // Get the page from database to find enPageId
  const page = await prisma.fundraisingPage.findUnique({
    where: { id: pageId },
  });

  if (!page) {
    const error = `Page not found in database: ${pageId}`;
    logger.error({ event: 'job.sync.single.page.not.found', err: new Error(error), jobId,
      pageId, }, error);
    return { updated: false, error };
  }

  logger.info({ event: 'job.sync.single.started', jobId,
    pageId,
    enPageId: page.enPageId, }, `Syncing single page from EN: ${page.name}`);

  try {
    // Fetch page details from EN API
    const pageDetails = await restClient.getPage(page.enPageId);

    logger.debug({ event: 'job.sync.single.details', jobId,
      enPageId: page.enPageId,
      subType: pageDetails.subType,
      campaignStatus: pageDetails.campaignStatus, }, `Fetched details for: ${page.name}`);

    // Public URL (see sync phase comment for why we don't use the EN admin host).
    if (!pageDetails.campaignBaseUrl) {
      throw new Error(
        `EN did not return campaignBaseUrl for ${page.name} (enPageId=${page.enPageId})`
      );
    }
    const pageUrl = `${pageDetails.campaignBaseUrl}/page/${page.enPageId}/donate/1`;

    // Update the page in database
    await prisma.fundraisingPage.update({
      where: { id: pageId },
      data: {
        name: pageDetails.name || page.name,
        url: pageUrl,
        status: determinePageStatus(pageDetails.campaignStatus, includeNonLive),
        lastSyncStatus: 'SUCCESS',
        lastSyncedAt: new Date(),
        title: pageDetails.title,
        campaignId: pageDetails.campaignId,
        subType: pageDetails.subType,
        clientId: pageDetails.clientId,
        campaignBaseUrl: pageDetails.campaignBaseUrl,
        campaignStatus: pageDetails.campaignStatus?.toLowerCase() ?? null,
        defaultLocale: pageDetails.defaultLocale,
        template: pageDetails.template,
        trackingParameters: pageDetails.trackingParameters || [],
        enCreatedAt: new Date(pageDetails.createdOn),
        enModifiedAt: new Date(pageDetails.modifiedOn),
      },
    });

    logger.info({ event: 'job.sync.single.complete', jobId,
      pageId,
      enPageId: page.enPageId,
      campaignStatus: pageDetails.campaignStatus, }, `Single page sync complete: ${page.name}`);

    jobLogger.phaseCompleted('SYNCING', 1, 0, 0);

    return { updated: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ event: 'job.sync.single.failed', err: error as Error, jobId, pageId, enPageId: page.enPageId }, `Failed to sync page: ${page.name}`);

    // Update sync status to failed
    await prisma.fundraisingPage.update({
      where: { id: pageId },
      data: {
        status: 'PAUSED',
        lastSyncStatus: 'FAILED',
        lastSyncedAt: new Date(),
      },
    });

    return { updated: false, error: errorMsg };
  }
}
