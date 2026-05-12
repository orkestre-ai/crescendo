import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { RecStatus, RecommendationCategory } from '@prisma/client';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/recommendations' });

/**
 * GET /api/recommendations
 *
 * List recommendations with optional filtering
 *
 * Query parameters:
 * - pageId: Filter by specific page
 * - category: Filter by recommendation category
 * - status: Filter by status (default: ACTIVE)
 * - page: page number (default: 1)
 * - pageSize: items per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const pageId = searchParams.get('pageId');
    const category = searchParams.get('category') as RecommendationCategory | null;
    const status = (searchParams.get('status') as RecStatus) || 'ACTIVE';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);

    // Build where clause
    const where: any = { status };
    if (pageId) where.pageId = pageId;
    if (category) where.category = category;

    // Get total count for pagination
    const total = await prisma.optimizationRecommendation.count({ where });

    // Fetch recommendations with page info
    const recommendations = await prisma.optimizationRecommendation.findMany({
      where,
      include: {
        page: {
          select: {
            id: true,
            name: true,
            url: true,
          },
        },
      },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Format response
    const formattedRecommendations = recommendations.map((rec) => ({
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
      recommendations: formattedRecommendations,
      total,
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch recommendations');
    return handleApiError(error);
  }
}
