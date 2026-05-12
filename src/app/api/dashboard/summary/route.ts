import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getDashboardSummary } from '@/lib/dashboard-summary';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/dashboard/summary' });

/**
 * GET /api/dashboard/summary
 *
 * Returns summary statistics for the dashboard:
 * - Total/active page counts
 * - Total donations (30-day, from EN)
 * - Total revenue (30-day, from EN)
 * - Last collection time
 * - Top/worst performers by 30-day revenue
 * - Recent recommendations
 */
export async function GET() {
  try {
    // Summary counts + revenue via shared helper (F-02).
    // Top/worst use DISTINCT ON CTEs (F-04) — dev DB has multiple LAST_30_DAYS
    // snapshot rows per page, so a plain findMany + take:5 would return 5 rows
    // from the same page. DISTINCT ON ("pageId") dedupes before ranking.
    const [summary, topRaw, worstRaw] = await Promise.all([
      getDashboardSummary(),
      prisma.$queryRaw<{ id: string; name: string; revenue: number }[]>`
        WITH latest_30d AS (
          SELECT DISTINCT ON ("pageId")
            "pageId", "totalAmount"
          FROM "FundraisingSnapshot"
          WHERE "periodType" = 'LAST_30_DAYS'
          ORDER BY "pageId", "fetchedAt" DESC
        )
        SELECT p.id, p.name, l."totalAmount"::float8 AS revenue
        FROM latest_30d l
        JOIN "FundraisingPage" p ON p.id = l."pageId"
        WHERE p.status = 'ACTIVE' AND p."campaignStatus" = 'live'
          AND l."totalAmount" > 0
        ORDER BY l."totalAmount" DESC
        LIMIT 5
      `,
      // Worst performers: no `totalAmount > 0` filter AND LEFT JOIN to pick up
      // live pages that have NO 30d snapshot yet (brand-new or never-collected) —
      // those are the pages a "worst performers" list most needs to surface.
      // Matches baseline behavior (pre-F-04 path returned revenue30d=0 for
      // snapshot-less pages via `page.fundraisingSnapshots[0]?.totalAmount ?? 0`).
      prisma.$queryRaw<{ id: string; name: string; revenue: number }[]>`
        WITH latest_30d AS (
          SELECT DISTINCT ON ("pageId")
            "pageId", "totalAmount"
          FROM "FundraisingSnapshot"
          WHERE "periodType" = 'LAST_30_DAYS'
          ORDER BY "pageId", "fetchedAt" DESC
        )
        SELECT p.id, p.name, COALESCE(l."totalAmount", 0)::float8 AS revenue
        FROM "FundraisingPage" p
        LEFT JOIN latest_30d l ON l."pageId" = p.id
        WHERE p.status = 'ACTIVE' AND p."campaignStatus" = 'live'
        ORDER BY COALESCE(l."totalAmount", 0) ASC
        LIMIT 5
      `,
    ]);

    const topPerformers = topRaw.map((r) => ({ id: r.id, name: r.name, revenue: Number(r.revenue) }));
    const worstPerformers = worstRaw.map((r) => ({ id: r.id, name: r.name, revenue: Number(r.revenue) }));

    // Get recent recommendations
    const recentRecommendations = await prisma.optimizationRecommendation.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        page: {
          select: {
            id: true,
            name: true,
            url: true,
          },
        },
      },
    });

    const formattedRecommendations = recentRecommendations.map((rec) => ({
      id: rec.id,
      pageId: rec.pageId,
      snapshotId: rec.snapshotId,
      category: rec.category,
      text: rec.text,
      confidence: rec.confidence,
      modelUsed: rec.modelUsed,
      tokenCount: rec.tokenCount,
      status: rec.status,
      dismissedAt: rec.dismissedAt?.toISOString() || null,
      dismissedBy: rec.dismissedBy,
      createdAt: rec.createdAt.toISOString(),
      updatedAt: rec.updatedAt.toISOString(),
      page: rec.page,
    }));

    return NextResponse.json({
      summary,
      topPerformers,
      worstPerformers,
      recentRecommendations: formattedRecommendations,
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch dashboard summary');
    return handleApiError(error);
  }
}
