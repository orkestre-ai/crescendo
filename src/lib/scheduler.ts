import cron from 'node-cron';
import { schedulerLogger } from '@/lib/logging/journeys';
import { shouldRunScheduledRefresh, updateLastRefresh } from './settings';
import { jobProcessor } from './jobs';
import { runCleanup } from './cleanup';
import { collectEnDaily, torontoDate } from './en-daily';
import { prisma } from './db';

let initialized = false;

/**
 * Check if there's already an active (PENDING or PROCESSING) job.
 * Prevents the scheduler from creating overlapping jobs.
 */
async function hasActiveJob(): Promise<boolean> {
  const count = await prisma.collectionJob.count({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
  });
  return count > 0;
}

/**
 * Initialize the in-process cron scheduler.
 * Registers hourly collection and weekly cleanup jobs.
 * Guarded by ENABLE_SCHEDULER env var (defaults to true).
 */
export function initScheduler(): void {
  if (initialized) {
    schedulerLogger.raw.debug({ event: 'scheduler.already_initialized' }, 'Scheduler already initialized, skipping');
    return;
  }

  if (process.env.ENABLE_SCHEDULER === 'false') {
    schedulerLogger.disabled('ENABLE_SCHEDULER=false');
    return;
  }

  // Hourly: check if a scheduled refresh should run
  cron.schedule('0 * * * *', async () => {
    schedulerLogger.tick();

    try {
      if (await hasActiveJob()) {
        schedulerLogger.skipped('a job is already running');
        return;
      }

      const shouldRefresh = await shouldRunScheduledRefresh();

      if (!shouldRefresh) {
        schedulerLogger.skipped('refresh skipped based on schedule settings');
        return;
      }

      schedulerLogger.jobTriggered('SYNC');

      const job = await jobProcessor.createCollectionJob('scheduler', 'SYNC');
      const result = await jobProcessor.processJobToCompletion(job.id);

      if (result.done) {
        await updateLastRefresh(job.id);
        schedulerLogger.jobCompleted(job.id, result.durationMs, result.iterations);
      } else {
        schedulerLogger.jobIncomplete(job.id, result.message);
      }
    } catch (error) {
      schedulerLogger.jobError(error as Error);
    }
  });

  // Weekly: cleanup old data (Sundays at 2 AM)
  cron.schedule('0 2 * * 0', async () => {
    schedulerLogger.cleanupTriggered();

    try {
      const result = await runCleanup();
      schedulerLogger.cleanupCompleted(result);
    } catch (error) {
      schedulerLogger.cleanupError(error as Error);
    }
  });

  // Daily at 05:00 Toronto: Engaging Networks giving for the last 7 days
  // through yesterday, so late or refunded gifts are corrected.
  cron.schedule(
    '0 5 * * *',
    async () => {
      try {
        const now = new Date();
        const result = await collectEnDaily({ from: torontoDate(now, 7), to: torontoDate(now, 1) });
        schedulerLogger.enDailyCompleted({ ...result, errors: result.errors.length });
      } catch (error) {
        schedulerLogger.enDailyError(error as Error);
      }
    },
    { timezone: 'America/Toronto' }
  );

  initialized = true;
  schedulerLogger.initialized('hourly collection, weekly cleanup, daily EN giving');
}
