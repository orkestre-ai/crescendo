import { subDays } from 'date-fns';
import { prisma } from './db';
import { rootLogger } from '@/lib/logging';
import { SNAPSHOTS_RETENTION_DAYS, JOBS_RETENTION_DAYS } from '@/config/constants';

const log = rootLogger.child({ journey: 'cleanup' });

const SUPERSEDE_AFTER_DAYS = 30;
const INSIGHTS_RETENTION_DAYS = 30;

/**
 * Run data cleanup: delete old snapshots, jobs, insights,
 * and mark stale recommendations as superseded.
 */
export async function runCleanup(): Promise<{
  snapshotsDeleted: number;
  jobsDeleted: number;
  recommendationsSuperseded: number;
  insightsDeleted: number;
}> {
  const now = new Date();

  log.info({ event: 'cleanup.start' }, 'Starting data cleanup');

  const [deletedSnapshots, deletedJobs, supersededRecs, deletedInsights] = await Promise.all([
    prisma.performanceSnapshot.deleteMany({
      where: { date: { lt: subDays(now, SNAPSHOTS_RETENTION_DAYS) } },
    }),
    prisma.collectionJob.deleteMany({
      where: { startedAt: { lt: subDays(now, JOBS_RETENTION_DAYS) } },
    }),
    prisma.optimizationRecommendation.updateMany({
      where: {
        status: 'ACTIVE',
        createdAt: { lt: subDays(now, SUPERSEDE_AFTER_DAYS) },
      },
      data: { status: 'SUPERSEDED' },
    }),
    prisma.pageInsight.deleteMany({
      where: { createdAt: { lt: subDays(now, INSIGHTS_RETENTION_DAYS) } },
    }),
  ]);

  const result = {
    snapshotsDeleted: deletedSnapshots.count,
    jobsDeleted: deletedJobs.count,
    recommendationsSuperseded: supersededRecs.count,
    insightsDeleted: deletedInsights.count,
  };

  log.info({ event: 'cleanup.complete', ...result }, 'Data cleanup completed');
  return result;
}
