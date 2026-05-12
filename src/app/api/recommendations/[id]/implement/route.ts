import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { validateCuid, isPrismaNotFound } from '@/lib/validation';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/recommendations/[id]/implement' });

/**
 * POST /api/recommendations/[id]/implement
 *
 * Mark a recommendation as implemented
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invalidId = validateCuid(id);
    if (invalidId) return invalidId;

    const recommendation = await prisma.optimizationRecommendation.update({
      where: { id },
      data: {
        status: 'IMPLEMENTED',
      },
    });

    logger.info({ recommendationId: id }, 'Marked recommendation as implemented');

    return NextResponse.json({
      ...recommendation,
      dismissedAt: recommendation.dismissedAt?.toISOString() || null,
      createdAt: recommendation.createdAt.toISOString(),
      updatedAt: recommendation.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    if (isPrismaNotFound(error)) {
      const { id } = await params;
      return NextResponse.json(
        {
          error: 'Recommendation not found',
          message: `Recommendation with ID ${id} not found`,
          statusCode: 404,
        },
        { status: 404 }
      );
    }
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to implement recommendation');
    return handleApiError(error);
  }
}
