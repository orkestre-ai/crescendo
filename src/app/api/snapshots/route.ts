import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/snapshots' });

/**
 * GET /api/snapshots
 *
 * Get performance snapshots for a specific page
 * Query params:
 * - pageId: Required - The page ID
 * - startDate: Optional - ISO date string (YYYY-MM-DD)
 * - endDate: Optional - ISO date string (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pageId = searchParams.get('pageId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!pageId) {
      return NextResponse.json(
        { error: 'Missing parameter', message: 'pageId is required', statusCode: 400 },
        { status: 400 }
      );
    }

    const where: any = { pageId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    const snapshots = await prisma.performanceSnapshot.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const formattedSnapshots = snapshots.map((snapshot) => ({
      ...snapshot,
      date: snapshot.date.toISOString().split('T')[0],
      gaCollectedAt: snapshot.gaCollectedAt?.toISOString() || null,
      enCollectedAt: snapshot.enCollectedAt?.toISOString() || null,
      createdAt: snapshot.createdAt.toISOString(),
      updatedAt: snapshot.updatedAt.toISOString(),
    }));

    return NextResponse.json({ snapshots: formattedSnapshots });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch snapshots');
    return handleApiError(error);
  }
}
