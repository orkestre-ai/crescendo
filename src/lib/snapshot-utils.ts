/**
 * FundraisingSnapshot utility functions
 *
 * Provides helpers for querying and processing fundraising snapshots
 */

import { prisma } from '@/lib/db';
import type { PeriodType, FundraisingSnapshot } from '@prisma/client';

/**
 * Fetch the latest fundraising snapshots for a page by period types
 *
 * Returns the most recent snapshot for each requested period type.
 * Uses `distinct` to ensure only one snapshot per period type is returned.
 *
 * @param pageId - The FundraisingPage ID (Prisma cuid)
 * @param periodTypes - Array of period types to fetch
 * @returns Map of period type to snapshot
 */
export async function fetchPeriodSnapshots(
  pageId: string,
  periodTypes: PeriodType[]
): Promise<Map<PeriodType, FundraisingSnapshot>> {
  const snapshots = await prisma.fundraisingSnapshot.findMany({
    where: {
      pageId,
      periodType: { in: periodTypes },
    },
    orderBy: { fetchedAt: 'desc' },
    distinct: ['periodType'],
  });

  const result = new Map<PeriodType, FundraisingSnapshot>();
  for (const snapshot of snapshots) {
    result.set(snapshot.periodType, snapshot);
  }

  return result;
}

/**
 * Fetch a single snapshot for a specific period type
 *
 * @param pageId - The FundraisingPage ID
 * @param periodType - The period type to fetch
 * @returns The snapshot or null if not found
 */
export async function fetchSingleSnapshot(
  pageId: string,
  periodType: PeriodType
): Promise<FundraisingSnapshot | null> {
  return prisma.fundraisingSnapshot.findFirst({
    where: { pageId, periodType },
    orderBy: { fetchedAt: 'desc' },
  });
}

/**
 * Check if snapshots exist for a page
 *
 * @param pageId - The FundraisingPage ID
 * @returns True if any snapshots exist
 */
export async function hasSnapshots(pageId: string): Promise<boolean> {
  const count = await prisma.fundraisingSnapshot.count({
    where: { pageId },
  });
  return count > 0;
}

/**
 * Calculate average gift from snapshot data
 *
 * @param totalAmount - Total donation amount
 * @param donationCount - Number of donations
 * @returns Average gift amount or 0 if no donations
 */
export function calculateAvgGift(totalAmount: number, donationCount: number): number {
  if (donationCount === 0) return 0;
  return totalAmount / donationCount;
}

/**
 * Check if a period is partial based on campaign creation date
 *
 * A period is partial if the campaign was created after the period start date,
 * meaning we don't have full data for the entire period.
 *
 * @param periodStart - Start date of the period
 * @param campaignCreatedAt - When the campaign was created
 * @returns True if the period is partial
 */
export function isPeriodPartial(
  periodStart: Date,
  campaignCreatedAt: Date | null | undefined
): boolean {
  if (!campaignCreatedAt) return false;
  return campaignCreatedAt > periodStart;
}

/**
 * Transform snapshot to RecentPerformanceProps format
 *
 * @param snapshot - The FundraisingSnapshot to transform
 * @returns Object with revenue, donors, counts, amounts, and avgGift
 */
export function snapshotToPerformanceData(snapshot: FundraisingSnapshot): {
  revenue: number;
  donors: number;
  singleCount: number;
  singleAmount: number;
  recurringCount: number;
  recurringAmount: number;
  avgGift: number;
} {
  return {
    revenue: snapshot.totalAmount,
    donors: snapshot.donationCount,
    singleCount: snapshot.singleCount,
    singleAmount: snapshot.singleAmount,
    recurringCount: snapshot.recurringCount,
    recurringAmount: snapshot.recurringAmount,
    avgGift: calculateAvgGift(snapshot.totalAmount, snapshot.donationCount),
  };
}

/**
 * Transform snapshot to comparison data (subset of fields)
 *
 * @param snapshot - The FundraisingSnapshot to transform
 * @returns Object with revenue, donors, and avgGift for comparison
 */
export function snapshotToComparisonData(snapshot: FundraisingSnapshot): {
  revenue: number;
  donors: number;
  avgGift: number;
} {
  return {
    revenue: snapshot.totalAmount,
    donors: snapshot.donationCount,
    avgGift: calculateAvgGift(snapshot.totalAmount, snapshot.donationCount),
  };
}
