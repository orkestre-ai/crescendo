import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/jobs/cleanup' });

/**
 * POST /api/jobs/cleanup
 * Cancel all stuck jobs (PROCESSING status with no updates for >5 minutes)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const olderThanMinutes = body.olderThanMinutes ?? 5;

    const staleThreshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    // Find stuck jobs
    const stuckJobs = await prisma.collectionJob.findMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: staleThreshold },
      },
      select: { id: true },
    });

    if (stuckJobs.length === 0) {
      return NextResponse.json({ cancelled: 0, jobIds: [] });
    }

    // Cancel them
    const jobIds = stuckJobs.map((j) => j.id);
    await prisma.collectionJob.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    logger.info({ jobIds, count: jobIds.length }, `Cancelled ${jobIds.length} stuck jobs`);

    return NextResponse.json({ cancelled: jobIds.length, jobIds });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to cleanup jobs');
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
