import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'exploration', route: '/api/pages/[id]/explorations/summary' });

// GET /api/pages/:id/explorations/summary — per-exploration result counts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const summaries = await prisma.pageInsight.groupBy({
      by: ['explorationId'],
      where: {
        pageId: id,
        mode: 'explore',
        explorationId: { not: null },
      },
      _count: { id: true },
      _max: { createdAt: true },
    });

    const mapped = summaries.map((s) => ({
      explorationId: s.explorationId,
      resultCount: s._count.id,
      latestAt: s._max.createdAt,
    }));

    return successResponse(mapped);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch exploration summary');
    return errorResponse(error, 'Failed to fetch exploration summary');
  }
}
