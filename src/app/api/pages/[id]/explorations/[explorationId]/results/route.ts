import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'exploration', route: '/api/pages/[id]/explorations/[explorationId]/results' });

// GET /api/pages/:id/explorations/:explorationId/results — paginated exploration results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; explorationId: string }> }
) {
  try {
    const { id, explorationId } = await params;
    const { searchParams } = request.nextUrl;
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '20', 10) || 20,
      100
    );

    const results = await prisma.pageInsight.findMany({
      where: {
        pageId: id,
        explorationId,
        mode: 'explore',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        response: true,
        toolCalls: true,
        usage: true,
        createdAt: true,
      },
    });

    return successResponse(results);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch exploration results');
    return errorResponse(error, 'Failed to fetch exploration results');
  }
}
