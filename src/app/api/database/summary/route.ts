import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/database/summary' });

export async function GET() {
  try {
    const [
      pages,
      contentSnapshots,
      performanceSnapshots,
      fundraisingSnapshots,
      recommendations,
      jobs,
    ] = await Promise.all([
      prisma.fundraisingPage.count(),
      prisma.contentSnapshot.count(),
      prisma.performanceSnapshot.count(),
      prisma.fundraisingSnapshot.count(),
      prisma.optimizationRecommendation.count({ where: { status: 'ACTIVE' } }),
      prisma.collectionJob.count(),
    ]);

    return NextResponse.json({
      pages,
      contentSnapshots,
      performanceSnapshots,
      fundraisingSnapshots,
      activeRecommendations: recommendations,
      totalJobs: jobs,
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to fetch database summary');
    return NextResponse.json({ error: 'Failed to fetch database summary' }, { status: 500 });
  }
}
