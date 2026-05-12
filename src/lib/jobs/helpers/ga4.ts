import type { Logger } from 'pino';
import type { FundraisingPage } from '@prisma/client';
import { prisma } from '../../db';
import { getGa4Client } from '../../google-analytics';
import { upsertZeroDataSnapshots as _upsertZeroDataSnapshots } from './snapshots';

export async function collectGA4Metrics(
  page: FundraisingPage,
  deps: { logger: Logger }
): Promise<void> {
  const { logger } = deps;

  // Check if page has any existing snapshots
  const existingSnapshotCount = await prisma.performanceSnapshot.count({
    where: { pageId: page.id },
  });

  // If no snapshots exist, backfill from page creation date (up to GA4's ~14 month retention)
  if (existingSnapshotCount === 0) {
    const startDate = page.enCreatedAt || page.createdAt;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const days = Math.max(
      1,
      Math.ceil((yesterday.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
    );

    logger.info({ event: 'page.ga4.backfill.auto', enPageId: page.enPageId, days, startDate: startDate.toISOString().split('T')[0] }, `No existing snapshots, triggering ${days}-day backfill (from ${startDate.toISOString().split('T')[0]}) for: ${page.name}`);
    await backfillGA4Metrics(page, days, { logger });
    return;
  }

  // Otherwise, just fetch yesterday's data (normal daily collection)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch GA4 metrics for yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const ga4 = await getGa4Client();
  const gaMetrics = await ga4.getPageMetrics(
    new URL(page.url).pathname,
    yesterdayStr,
    yesterdayStr
  );

  // Create or update performance snapshot
  await prisma.performanceSnapshot.upsert({
    where: {
      pageId_date: {
        pageId: page.id,
        date: yesterday,
      },
    },
    update: {
      pageViews: gaMetrics.pageViews,
      bounceRate: gaMetrics.bounceRate,
      conversions: gaMetrics.conversions,
      revenue: gaMetrics.revenue,
      avgSessionDuration: gaMetrics.avgSessionDuration,
      conversionRate: gaMetrics.pageViews > 0 ? gaMetrics.conversions / gaMetrics.pageViews : 0,
      gaCollectedAt: new Date(),
    },
    create: {
      pageId: page.id,
      date: yesterday,
      pageViews: gaMetrics.pageViews,
      bounceRate: gaMetrics.bounceRate,
      conversions: gaMetrics.conversions,
      revenue: gaMetrics.revenue,
      avgSessionDuration: gaMetrics.avgSessionDuration,
      conversionRate: gaMetrics.pageViews > 0 ? gaMetrics.conversions / gaMetrics.pageViews : 0,
      gaCollectedAt: new Date(),
    },
  });

  logger.debug({ event: 'page.ga4.collected', enPageId: page.enPageId,
    pageViews: gaMetrics.pageViews,
    conversions: gaMetrics.conversions, }, `Collected GA4 metrics for: ${page.name}`);
}

/**
 * Backfill GA4 historical metrics for a page
 * Creates daily snapshots for each day in the specified range
 *
 * @param page - The page to backfill metrics for
 * @param days - Number of days to backfill
 */
export async function backfillGA4Metrics(
  page: FundraisingPage,
  days: number,
  deps: { logger: Logger }
): Promise<{ daysBackfilled: number; daysWithData: number }> {
  const { logger } = deps;
  const pagePath = new URL(page.url).pathname;

  logger.info({ event: 'page.ga4.backfill.started', enPageId: page.enPageId, days, pagePath }, `Starting ${days}-day GA4 backfill for: ${page.name}`);

  // Get historical metrics from GA4 (single API call with date dimension)
  const ga4 = await getGa4Client();
  const historicalMetrics = await ga4.getHistoricalMetrics(pagePath, days);

  // Create snapshots for each day
  let daysWithData = 0;
  for (const [dateStr, metrics] of historicalMetrics) {
    // Parse the date string (YYYY-MM-DD) to create a Date object
    const [year, month, day] = dateStr.split('-').map(Number);
    const snapshotDate = new Date(year, month - 1, day);
    snapshotDate.setHours(0, 0, 0, 0);

    // Create or update snapshot for this date
    await prisma.performanceSnapshot.upsert({
      where: {
        pageId_date: {
          pageId: page.id,
          date: snapshotDate,
        },
      },
      update: {
        pageViews: metrics.pageViews,
        bounceRate: metrics.bounceRate,
        conversions: metrics.conversions,
        revenue: metrics.revenue,
        avgSessionDuration: metrics.avgSessionDuration,
        conversionRate: metrics.pageViews > 0 ? metrics.conversions / metrics.pageViews : 0,
        gaCollectedAt: new Date(),
      },
      create: {
        pageId: page.id,
        date: snapshotDate,
        pageViews: metrics.pageViews,
        bounceRate: metrics.bounceRate,
        conversions: metrics.conversions,
        revenue: metrics.revenue,
        avgSessionDuration: metrics.avgSessionDuration,
        conversionRate: metrics.pageViews > 0 ? metrics.conversions / metrics.pageViews : 0,
        gaCollectedAt: new Date(),
      },
    });

    if (metrics.pageViews > 0) {
      daysWithData++;
    }
  }

  // Fill zero-data snapshots for days in the backfill range that had no GA4 data
  const bfToday = new Date();
  bfToday.setHours(0, 0, 0, 0);
  const bfEndDate = new Date(bfToday);
  bfEndDate.setDate(bfEndDate.getDate() - 1);
  const bfStartDate = new Date(bfEndDate);
  bfStartDate.setDate(bfStartDate.getDate() - (days - 1));
  const startStr = bfStartDate.toISOString().split('T')[0];
  const endStr = bfEndDate.toISOString().split('T')[0];

  const zerosFilled = await _upsertZeroDataSnapshots(
    page.id,
    startStr,
    endStr,
    historicalMetrics,
    { logger }
  );

  logger.info({ event: 'page.ga4.backfill.completed', enPageId: page.enPageId,
    daysBackfilled: historicalMetrics.size,
    daysWithData,
    zeroDataDaysFilled: zerosFilled, }, `GA4 backfill completed for: ${page.name}`);

  return {
    daysBackfilled: historicalMetrics.size + zerosFilled,
    daysWithData,
  };
}
