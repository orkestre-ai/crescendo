/**
 * Scheduler Journey Logger
 *
 * Logs scheduler lifecycle. Tick/skip events are demoted to TRACE
 * (invisible) to suppress hourly noise.
 *
 * Correlation key: none (singleton)
 */

import { rootLogger } from '../index';

const log = rootLogger.child({ journey: 'scheduler' });

export const schedulerLogger = {
  raw: log,

  // ─── Console Events (INFO) ─────────────────────────────────

  initialized(schedules: string) {
    log.info(
      { event: 'scheduler.initialized' },
      `Scheduler started (${schedules})`
    );
  },

  disabled(reason: string) {
    log.info(
      { event: 'scheduler.disabled', reason },
      `Scheduler disabled — ${reason}`
    );
  },

  jobTriggered(jobType: string) {
    log.info(
      { event: 'scheduler.job.triggered', jobType },
      `Scheduler → creating ${jobType} job`
    );
  },

  jobCompleted(jobId: string, durationMs: number, iterations: number) {
    log.info(
      { event: 'scheduler.job.completed', jobId, durationMs, iterations },
      `Scheduled job completed (${(durationMs / 1000).toFixed(1)}s, ${iterations} iterations)`
    );
  },

  jobIncomplete(jobId: string, message: string) {
    log.warn(
      { event: 'scheduler.job.incomplete', jobId, message },
      `Scheduled job did not complete — ${message}`
    );
  },

  jobError(err: Error) {
    log.error(
      { event: 'scheduler.job.error', err },
      `Error in scheduled collection`
    );
  },

  cleanupTriggered() {
    log.info(
      { event: 'scheduler.cleanup.triggered' },
      `Scheduler → running weekly cleanup`
    );
  },

  cleanupCompleted(result: Record<string, unknown>) {
    log.info(
      { event: 'scheduler.cleanup.completed', ...result },
      `Weekly cleanup completed`
    );
  },

  cleanupError(err: Error) {
    log.error(
      { event: 'scheduler.cleanup.error', err },
      `Error in weekly cleanup`
    );
  },

  // ─── Suppressed Events (TRACE — invisible) ────────────────

  tick() {
    log.trace({ event: 'scheduler.hourly.tick' }, 'Hourly scheduler tick');
  },

  skipped(reason: string) {
    log.trace(
      { event: 'scheduler.hourly.skipped', reason },
      `Scheduler tick skipped — ${reason}`
    );
  },
};
