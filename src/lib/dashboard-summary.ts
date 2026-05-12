import { prisma } from '@/lib/db';

export interface DashboardSummary {
  livePages: number;
  activePages: number;
  totalUniquePages: number;
  totalRevenue: number;
  totalDonations: number;
  lastCollectionAt: string | null;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // Kick off 5 queries in parallel.
  const [livePages, totalUniquePages, activePages, lastJob, revenueRows] = await Promise.all([
    prisma.fundraisingPage.count({ where: { status: 'ACTIVE', campaignStatus: 'live' } }),
    prisma.fundraisingPage.count(),
    prisma.fundraisingPage.count({ where: { status: 'ACTIVE' } }),
    prisma.collectionJob.findFirst({
      where: { status: { in: ['COMPLETED', 'COMPLETED_WITH_ERRORS'] } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    }),
    // DISTINCT ON picks the latest LAST_30_DAYS snapshot per page, then we sum
    // only those owned by ACTIVE + live pages. Dev DB has duplicate periodType
    // rows per page (confirmed — some pages have 13), so aggregate() would
    // massively overstate totals. The DISTINCT ON dedupes at the pageId level.
    prisma.$queryRaw<{ totalRevenue: number; totalDonations: number }[]>`
      WITH latest_30d AS (
        SELECT DISTINCT ON ("pageId")
          "pageId", "totalAmount", "donationCount"
        FROM "FundraisingSnapshot"
        WHERE "periodType" = 'LAST_30_DAYS'
        ORDER BY "pageId", "fetchedAt" DESC
      )
      SELECT
        COALESCE(SUM(l."totalAmount"), 0)::float8 AS "totalRevenue",
        COALESCE(SUM(l."donationCount"), 0)::int AS "totalDonations"
      FROM latest_30d l
      JOIN "FundraisingPage" p ON p.id = l."pageId"
      WHERE p.status = 'ACTIVE' AND p."campaignStatus" = 'live'
    `,
  ]);

  const row = revenueRows[0] ?? { totalRevenue: 0, totalDonations: 0 };

  return {
    livePages,
    activePages,
    totalUniquePages,
    totalRevenue: Number(row.totalRevenue),
    totalDonations: Number(row.totalDonations),
    lastCollectionAt: lastJob?.completedAt?.toISOString() ?? null,
  };
}
