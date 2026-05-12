import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { PageStatus } from '@prisma/client';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/pages' });

/**
 * GET /api/pages
 *
 * List all fundraising pages with filtering and sorting
 *
 * Query parameters:
 * - status: PageStatus (ACTIVE, PAUSED, ARCHIVED)
 * - sortBy: name | conversionRate | pageViews | revenue
 * - sortOrder: asc | desc
 * - page: page number (default: 1)
 * - pageSize: items per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query parameters
    const statusParam = searchParams.get('status');
    const validStatuses: PageStatus[] = ['ACTIVE', 'PAUSED', 'ARCHIVED'];
    const status: PageStatus | null = statusParam && validStatuses.includes(statusParam as PageStatus)
      ? (statusParam as PageStatus)
      : null;
    const sortBy = searchParams.get('sortBy') || 'conversionRate';
    const sortOrderParam = searchParams.get('sortOrder');
    const sortOrder: 'asc' | 'desc' = sortOrderParam === 'desc' ? 'desc' : 'asc';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);

    // Build where clause
    const where = status ? { status } : {};

    // Move name sorting to Prisma for DB-level efficiency
    const prismaOrderBy =
      sortBy === 'name'
        ? { name: sortOrder as 'asc' | 'desc' }
        : undefined;

    // Fetch pages with latest snapshot
    const pages = await prisma.fundraisingPage.findMany({
      where,
      orderBy: prismaOrderBy,
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 1,
        },
        recommendations: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    // Calculate metrics and prepare response data
    const pagesWithMetrics = pages.map((page) => {
      const latestSnapshot = page.snapshots[0] || null;
      return {
        id: page.id,
        enPageId: page.enPageId,
        name: page.name,
        url: page.url,
        pageType: page.pageType,
        status: page.status,
        headline: page.headline,
        metaDescription: page.metaDescription,
        ctaButtons: page.ctaButtons,
        donationAmounts: page.donationAmounts,
        lastScrapedAt: page.lastScrapedAt?.toISOString() || null,
        createdAt: page.createdAt.toISOString(),
        updatedAt: page.updatedAt.toISOString(),
        latestSnapshot: latestSnapshot
          ? {
              id: latestSnapshot.id,
              pageId: latestSnapshot.pageId,
              date: latestSnapshot.date.toISOString().split('T')[0],
              pageViews: latestSnapshot.pageViews,
              bounceRate: latestSnapshot.bounceRate,
              conversions: latestSnapshot.conversions,
              revenue: latestSnapshot.revenue,
              avgSessionDuration: latestSnapshot.avgSessionDuration,
              conversionRate: latestSnapshot.conversionRate,
              gaCollectedAt: latestSnapshot.gaCollectedAt?.toISOString() || null,
              enCollectedAt: latestSnapshot.enCollectedAt?.toISOString() || null,
              createdAt: latestSnapshot.createdAt.toISOString(),
              updatedAt: latestSnapshot.updatedAt.toISOString(),
            }
          : null,
        recommendationCount: page.recommendations.length,
      };
    });

    // Only sort in-memory for fields that require nested snapshot data
    // Name sorting is handled by Prisma orderBy above
    const sortedPages = prismaOrderBy
      ? pagesWithMetrics
      : [...pagesWithMetrics].sort((a, b) => {
          let aValue: number;
          let bValue: number;

          switch (sortBy) {
            case 'conversionRate':
              aValue = a.latestSnapshot?.conversionRate || 0;
              bValue = b.latestSnapshot?.conversionRate || 0;
              break;
            case 'pageViews':
              aValue = a.latestSnapshot?.pageViews || 0;
              bValue = b.latestSnapshot?.pageViews || 0;
              break;
            case 'revenue':
              aValue = a.latestSnapshot?.revenue || 0;
              bValue = b.latestSnapshot?.revenue || 0;
              break;
            default:
              aValue = a.latestSnapshot?.conversionRate || 0;
              bValue = b.latestSnapshot?.conversionRate || 0;
          }

          const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          return sortOrder === 'asc' ? comparison : -comparison;
        });

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPages = sortedPages.slice(startIndex, endIndex);

    return NextResponse.json({
      pages: paginatedPages,
      total: sortedPages.length,
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch pages');
    return handleApiError(error);
  }
}
