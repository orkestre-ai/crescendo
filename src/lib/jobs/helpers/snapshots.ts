import type { Logger } from 'pino';
import type { FundraisingPage } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { captureScreenshot, capturePageDiagnostics } from '../../playwright-scraper';
import { uploadScreenshot } from '../../screenshot-storage';
import { getScrapableUrl } from '../../url-utils';
import { getScrapingSettings } from '../../settings';

export async function createSnapshotWithLifetime(
  page: FundraisingPage,
  contentHash: string,
  content: import('@/types').PageContent,
  settings: Awaited<ReturnType<typeof getScrapingSettings>>,
  deps: { logger: Logger }
): Promise<void> {
  const { logger } = deps;
  const now = new Date();

  // Capture desktop screenshot (best-effort, per D-03 only on hash change)
  let screenshotUrl: string | null = null;
  if (settings.depth.screenshots) {
    try {
      const screenshotBuffer = await captureScreenshot(getScrapableUrl(page));
      screenshotUrl = await uploadScreenshot(page.id, screenshotBuffer, 'desktop');
    } catch (error) {
      logger.warn({ event: 'snapshot.screenshot.failed', pageId: page.id, error: (error as Error).message }, `Desktop screenshot failed for ${page.name}`);
    }
  }

  // Capture mobile screenshot + page diagnostics (best-effort)
  let mobileScreenshotUrl: string | null = null;
  let diagnostics: import('@/types').PageDiagnostics | null = null;
  if (settings.depth.screenshots || settings.depth.consoleErrors) {
    try {
      const result = await capturePageDiagnostics(getScrapableUrl(page));
      if (settings.depth.screenshots) {
        mobileScreenshotUrl = await uploadScreenshot(page.id, result.mobileScreenshot, 'mobile');
      }
      if (settings.depth.consoleErrors) {
        diagnostics = result.diagnostics;
      }
    } catch (error) {
      logger.warn({ event: 'snapshot.diagnostics.failed', pageId: page.id, error: (error as Error).message }, `Diagnostics capture failed for ${page.name}`);
    }
  }

  // Close previous active snapshot + create new one atomically. If create()
  // hits a P2002 conflict, the transaction rolls back so the prior snapshot
  // remains active — preventing pages from being left with no validTo=null row.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.contentSnapshot.updateMany({
        where: {
          pageId: page.id,
          validTo: null,
        },
        data: {
          validTo: now,
        },
      });

      await tx.contentSnapshot.create({
        data: {
          pageId: page.id,
          contentHash,
          metaTitle: content.metaTitle ?? null,
          appealText: content.appealText ?? null,
          narrativeText: content.narrativeText ?? null,
          rawHtml: content.rawHtml ?? null,
          screenshotUrl,
          mobileScreenshotUrl,
          diagnostics: diagnostics ? JSON.parse(JSON.stringify(diagnostics)) : null,
          enModifiedAt: page.enModifiedAt ?? null,
          validFrom: now,
          validTo: null, // Currently active
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Snapshot with same pageId + contentHash already exists — txn rolled back, prior active snapshot preserved.
      logger.info({ event: 'snapshot.duplicate.skipped', pageId: page.id,
        contentHash: contentHash.substring(0, 12), }, `Snapshot already exists for ${page.name}`);
      return;
    }
    throw error;
  }

  logger.info({ event: 'snapshot.created', pageId: page.id,
    contentHash: contentHash.substring(0, 12),
    hasScreenshot: !!screenshotUrl,
    hasMobileScreenshot: !!mobileScreenshotUrl,
    hasDiagnostics: !!diagnostics,
    hasAppealText: !!content.appealText,
    hasMetaTitle: !!content.metaTitle, }, `Created content snapshot for ${page.name}`);
}

export async function upsertZeroDataSnapshots(
  pageId: string,
  startDate: string,
  endDate: string,
  ga4Results: Map<string, any>,
  _deps: { logger: Logger }
): Promise<number> {
  let zerosFilled = 0;
  const cursor = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  while (cursor <= end) {
    const dateStr = cursor.toISOString().split('T')[0];

    if (!ga4Results.has(dateStr)) {
      const snapshotDate = new Date(cursor);
      snapshotDate.setHours(0, 0, 0, 0);

      await prisma.performanceSnapshot.upsert({
        where: {
          pageId_date: { pageId, date: snapshotDate },
        },
        update: {
          gaCollectedAt: new Date(),
        },
        create: {
          pageId,
          date: snapshotDate,
          pageViews: 0,
          bounceRate: 0,
          conversions: 0,
          revenue: 0,
          avgSessionDuration: 0,
          conversionRate: 0,
          gaCollectedAt: new Date(),
        },
      });
      zerosFilled++;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return zerosFilled;
}
