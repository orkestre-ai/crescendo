import type { Logger } from 'pino';
import type { FundraisingPage, PeriodType } from '@prisma/client';
import { prisma } from '../../db';
import { getENPublicClientAsync, isENPublicConfiguredAsync } from '../../en-public-client';
import { NETDONOR_SLOW_THRESHOLD_MS } from '@/config/constants';
import { toFundraisingUpdateInput } from '@/types/fundraising';
import { getPeriodDatesForCampaign } from '../../date-utils';
import { getReportingCurrency } from '../../settings';

export async function collectNetDonorData(
  page: FundraisingPage,
  deps: { logger: Logger }
): Promise<{
  success: boolean;
  skipped: boolean;
  error?: string;
}> {
  const { logger } = deps;

  // Check if EN Public API is configured (T024)
  if (!await isENPublicConfiguredAsync()) {
    // Silently skip - this is expected when token is not configured
    logger.debug({ event: 'page.netdonor.skipped.no_token', enPageId: page.enPageId }, `Skipping NetDonor (no token configured): ${page.name}`);
    return { success: false, skipped: true };
  }

  // Check if page has a campaign ID (T027)
  if (!page.campaignId) {
    logger.info({ event: 'page.netdonor.skipped.no_campaign', enPageId: page.enPageId, pageId: page.id }, `Skipping NetDonor (no campaign ID): ${page.name}`);
    return { success: false, skipped: true };
  }

  const enPublicClient = await getENPublicClientAsync();
  if (!enPublicClient) {
    // This shouldn't happen since we checked isENPublicConfigured, but handle gracefully
    return { success: false, skipped: true };
  }

  try {
    // Fetch NetDonor data from EN Public API
    const netDonorStart = performance.now();
    const fundraisingData = await enPublicClient.fetchNetDonor(page.campaignId);
    const netDonorDuration = performance.now() - netDonorStart;

    // Warn on slow responses — helps identify pages with large datasets
    if (netDonorDuration > NETDONOR_SLOW_THRESHOLD_MS) {
      logger.warn({ event: 'page.netdonor.slow', enPageId: page.enPageId, campaignId: page.campaignId, durationMs: Math.round(netDonorDuration), thresholdMs: NETDONOR_SLOW_THRESHOLD_MS }, `NetDonor call took ${Math.round(netDonorDuration)}ms for: ${page.name}`);
    }

    if (!fundraisingData) {
      // Empty response - campaign not found or no donations yet
      logger.info({ event: 'page.netdonor.empty', enPageId: page.enPageId,
        campaignId: page.campaignId, }, `NetDonor returned no data for: ${page.name}`);
      return { success: true, skipped: false }; // Not an error, just no data
    }

    // Update page with fundraising data
    const updateData = toFundraisingUpdateInput(fundraisingData);
    await prisma.fundraisingPage.update({
      where: { id: page.id },
      data: updateData,
    });

    // Log success (T026)
    logger.info({ event: 'page.netdonor.collected', enPageId: page.enPageId,
      campaignId: page.campaignId,
      totalDonated: fundraisingData.totalDonated,
      registrations: fundraisingData.registrations,
      supporters: fundraisingData.supporters, }, `Collected NetDonor data for: ${page.name}`);

    return { success: true, skipped: false };
  } catch (error) {
    // Log failure but don't throw - non-blocking (T025, T026)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ event: 'page.netdonor.failed', err: error as Error, enPageId: page.enPageId, campaignId: page.campaignId }, `Failed to fetch NetDonor data for: ${page.name}`);
    return { success: false, skipped: false, error: errorMessage };
  }
}

/**
 * Collect period-based fundraising snapshots for a page
 *
 * Fetches data from EN Public API for:
 * - LAST_7_DAYS: Current 7-day period
 * - PREV_7_DAYS: Previous 7-day period (for comparison)
 * - LAST_30_DAYS: Last 30 days
 *
 * This is a non-blocking operation - failures are logged but don't stop the job.
 */
export async function collectFundraisingSnapshots(
  page: FundraisingPage,
  deps: { logger: Logger }
): Promise<{
  success: boolean;
  skipped: boolean;
  periodsCollected: number;
  error?: string;
}> {
  const { logger } = deps;

  // Check if EN Public API is configured (T065)
  if (!await isENPublicConfiguredAsync()) {
    logger.debug({ event: 'page.fundraising_snapshot.skipped.no_token', enPageId: page.enPageId }, `Skipping fundraising snapshots (no token configured): ${page.name}`);
    return { success: false, skipped: true, periodsCollected: 0 };
  }

  // Check if page has an enPageId (T065)
  if (!page.enPageId) {
    logger.info({ event: 'page.fundraising_snapshot.skipped.no_enPageId', pageId: page.id }, `Skipping fundraising snapshots (no enPageId): ${page.name}`);
    return { success: false, skipped: true, periodsCollected: 0 };
  }

  const enPublicClient = await getENPublicClientAsync();
  if (!enPublicClient) {
    return { success: false, skipped: true, periodsCollected: 0 };
  }

  // Get configured reporting currency (T066)
  const currency = await getReportingCurrency();

  // Calculate date ranges
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const periods: Array<{
    type: PeriodType;
    start: Date;
    end: Date;
  }> = [
    // LAST_7_DAYS: today - 6 days to today
    {
      type: 'LAST_7_DAYS' as PeriodType,
      start: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
      end: today,
    },
    // PREV_7_DAYS: today - 13 days to today - 7 days
    {
      type: 'PREV_7_DAYS' as PeriodType,
      start: new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000),
      end: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
    },
    // LAST_30_DAYS: today - 29 days to today
    {
      type: 'LAST_30_DAYS' as PeriodType,
      start: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000),
      end: today,
    },
  ];

  // Add LIFETIME period using campaign creation date
  const lifetimeDates = getPeriodDatesForCampaign('LIFETIME', page.enCreatedAt);
  if (lifetimeDates) {
    periods.push({
      type: 'LIFETIME' as PeriodType,
      start: lifetimeDates.start,
      end: lifetimeDates.end,
    });
  }

  let periodsCollected = 0;
  const errors: string[] = [];

  for (const period of periods) {
    try {
      const startDate = period.start.toISOString().split('T')[0];
      const endDate = period.end.toISOString().split('T')[0];

      // Fetch fundraising summary for this period (T061)
      const summary = await enPublicClient.fetchFundraisingSummaryByPage(
        page.enPageId,
        startDate,
        endDate,
        currency
      );

      // Build base snapshot data
      const snapshotData = {
        totalAmount: summary?.totalAmount ?? 0,
        donationCount: summary?.donationCount ?? 0,
        singleCount: summary?.singleCount ?? 0,
        singleAmount: summary?.singleAmount ?? 0,
        recurringCount: summary?.recurringCount ?? 0,
        recurringAmount: summary?.recurringAmount ?? 0,
        currency,
        fetchedAt: new Date(),
        // Include lifetime-only fields from NetDonor data on the page
        ...(period.type === 'LIFETIME'
          ? {
              highestDonation: page.fundraisingHighestDonation ?? null,
              averageDonation: page.fundraisingAverageDonation ?? null,
              supporters: page.fundraisingSupporters ?? null,
            }
          : {}),
      };

      // Upsert the snapshot (T062)
      await prisma.fundraisingSnapshot.upsert({
        where: {
          pageId_periodType_periodStart_periodEnd: {
            pageId: page.id,
            periodType: period.type,
            periodStart: period.start,
            periodEnd: period.end,
          },
        },
        update: snapshotData,
        create: {
          pageId: page.id,
          periodType: period.type,
          periodStart: period.start,
          periodEnd: period.end,
          ...snapshotData,
        },
      });

      periodsCollected++;

      // Log success for this period (T064)
      logger.debug({ event: 'page.fundraising_snapshot.period.collected', enPageId: page.enPageId, periodType: period.type, totalAmount: summary?.totalAmount ?? 0, donationCount: summary?.donationCount ?? 0 }, `Collected ${period.type} snapshot for: ${page.name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${period.type}: ${errorMsg}`);
      logger.warn({ event: 'page.fundraising_snapshot.period.failed', enPageId: page.enPageId, periodType: period.type, error: errorMsg }, `Failed to collect ${period.type} for: ${page.name}`);
    }
  }

  // Log summary (T064)
  if (periodsCollected > 0) {
    logger.info({ event: 'page.fundraising_snapshot.collected', enPageId: page.enPageId, periodsCollected, totalPeriods: periods.length, currency }, `Collected ${periodsCollected}/${periods.length} fundraising snapshots for: ${page.name}`);
  }

  // Return result (T063 - graceful failure handling)
  if (errors.length === periods.length) {
    // All periods failed
    return {
      success: false,
      skipped: false,
      periodsCollected: 0,
      error: errors.join('; '),
    };
  }

  return {
    success: periodsCollected > 0,
    skipped: false,
    periodsCollected,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
