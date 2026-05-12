import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { validateCuid, isPrismaNotFound } from '@/lib/validation';
import { PageStatus } from '@prisma/client';
import { calculateTrend } from '@/lib/analytics';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/pages/[id]' });

/**
 * GET /api/pages/[id]
 *
 * Get detailed page information including:
 * - Page metadata
 * - Latest snapshot
 * - Last 30 days of snapshots
 * - Active recommendations
 * - Performance trend analysis
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invalidId = validateCuid(id);
    if (invalidId) return invalidId;

    const page = await prisma.fundraisingPage.findUnique({
      where: { id },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        recommendations: {
          where: { status: 'ACTIVE' },
          orderBy: { confidence: 'desc' },
        },
      },
    });

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found', message: `Page with ID ${id} not found`, statusCode: 404 },
        { status: 404 }
      );
    }

    const latestSnapshot = page.snapshots[0] || null;

    // Calculate performance metrics
    const conversionRates = page.snapshots.map((s) => s.conversionRate).filter((r) => r > 0);

    const avgConversionRate =
      conversionRates.length > 0
        ? conversionRates.reduce((sum, r) => sum + r, 0) / conversionRates.length
        : 0;

    const totalRevenue = page.snapshots.reduce((sum, s) => sum + s.revenue, 0);

    const trend = calculateTrend(
      page.snapshots.map((s) => ({
        date: s.date,
        conversionRate: s.conversionRate,
        pageViews: s.pageViews,
        revenue: s.revenue,
        bounceRate: s.bounceRate,
      }))
    );

    // Format response
    const response = {
      page: {
        ...page,
        lastScrapedAt: page.lastScrapedAt?.toISOString() || null,
        createdAt: page.createdAt.toISOString(),
        updatedAt: page.updatedAt.toISOString(),
        snapshots: undefined,
        recommendations: undefined,
      },
      latestSnapshot: latestSnapshot
        ? {
            ...latestSnapshot,
            date: latestSnapshot.date.toISOString().split('T')[0],
            gaCollectedAt: latestSnapshot.gaCollectedAt?.toISOString() || null,
            enCollectedAt: latestSnapshot.enCollectedAt?.toISOString() || null,
            createdAt: latestSnapshot.createdAt.toISOString(),
            updatedAt: latestSnapshot.updatedAt.toISOString(),
          }
        : null,
      snapshots: page.snapshots.map((snapshot) => ({
        ...snapshot,
        date: snapshot.date.toISOString().split('T')[0],
        gaCollectedAt: snapshot.gaCollectedAt?.toISOString() || null,
        enCollectedAt: snapshot.enCollectedAt?.toISOString() || null,
        createdAt: snapshot.createdAt.toISOString(),
        updatedAt: snapshot.updatedAt.toISOString(),
      })),
      recommendations: page.recommendations.map((rec) => ({
        ...rec,
        dismissedAt: rec.dismissedAt?.toISOString() || null,
        createdAt: rec.createdAt.toISOString(),
        updatedAt: rec.updatedAt.toISOString(),
      })),
      performance: {
        avgConversionRate,
        trend,
        totalRevenue,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch page detail');
    return handleApiError(error);
  }
}

/**
 * PATCH /api/pages/[id]
 *
 * Update page status (ACTIVE, PAUSED, ARCHIVED)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invalidId = validateCuid(id);
    if (invalidId) return invalidId;

    const body = await request.json();
    const { status } = body;

    if (!status || !['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
      return NextResponse.json(
        {
          error: 'Invalid status',
          message: 'Status must be ACTIVE, PAUSED, or ARCHIVED',
          statusCode: 400,
        },
        { status: 400 }
      );
    }

    const page = await prisma.fundraisingPage.update({
      where: { id },
      data: { status: status as PageStatus },
    });

    logger.info({ pageId: id, status }, 'Updated page status');

    return NextResponse.json({
      ...page,
      lastScrapedAt: page.lastScrapedAt?.toISOString() || null,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    if (isPrismaNotFound(error)) {
      const { id } = await params;
      return NextResponse.json(
        { error: 'Page not found', message: `Page with ID ${id} not found`, statusCode: 404 },
        { status: 404 }
      );
    }
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to update page status');
    return handleApiError(error);
  }
}
