/**
 * Job Journey Logger
 *
 * Logs job lifecycle events: creation, phase transitions, page processing,
 * completion. Console shows milestones only; full detail goes to log file.
 *
 * Correlation key: jobId
 */

import { rootLogger } from '../index';

export function createJobLogger(jobId: string, jobType?: string) {
  const log = rootLogger.child({ journey: 'job', jobId, jobType });

  return {
    /** raw pino child — for pass-through to sub-modules */
    raw: log,

    // ─── Console Events (INFO+) ──────────────────────────────────

    created(totalPages: number, triggeredBy: string) {
      log.info(
        { event: 'job.created', totalPages, triggeredBy },
        `${jobType ?? 'SYNC'} job created → ${totalPages} pages (triggered by: ${triggeredBy})`
      );
    },

    phaseStarted(phase: string, pageCount: number) {
      log.info(
        { event: 'job.phase.started', phase, pageCount },
        `▸ ${phase} — ${pageCount} pages`
      );
    },

    phaseCompleted(phase: string, processed: number, errors: number, durationMs: number) {
      const secs = (durationMs / 1000).toFixed(1);
      if (errors > 0) {
        log.warn(
          { event: 'job.phase.completed', phase, processed, errors, durationMs },
          `✓ ${phase} — ${processed - errors}/${processed} pages, ${errors} errors (${secs}s)`
        );
      } else {
        log.info(
          { event: 'job.phase.completed', phase, processed, errors: 0, durationMs },
          `✓ ${phase} — ${processed}/${processed} pages, 0 errors (${secs}s)`
        );
      }
    },

    phaseSkipped(phase: string, reason: string) {
      log.info(
        { event: 'job.phase.skipped', phase, reason },
        `⊘ ${phase} — skipped (${reason})`
      );
    },

    completed(totalPages: number, errors: number, durationMs: number) {
      const secs = (durationMs / 1000).toFixed(1);
      if (errors > 0) {
        log.warn(
          { event: 'job.completed_with_errors', totalPages, errors, durationMs },
          `⚠ ${jobType ?? 'SYNC'} job complete — ${totalPages - errors}/${totalPages} pages, ${errors} errors, ${secs}s`
        );
      } else {
        log.info(
          { event: 'job.completed', totalPages, errors: 0, durationMs },
          `✓ ${jobType ?? 'SYNC'} job complete — ${totalPages} pages, 0 errors, ${secs}s`
        );
      }
    },

    failed(reason: string, durationMs: number, err?: Error) {
      const secs = (durationMs / 1000).toFixed(1);
      log.error(
        { event: 'job.failed', err, durationMs },
        `✗ ${jobType ?? 'SYNC'} job failed — "${reason}" (${secs}s)`
      );
    },

    pageFailed(pageId: string, pageName: string, reason: string) {
      log.warn(
        { event: 'job.page.failed', pageId, pageName, reason },
        `Page "${pageName}" — ${reason}`
      );
    },

    pageCfBlocked(pageId: string, pageName: string) {
      log.warn(
        { event: 'job.page.cf_blocked', pageId, pageName },
        `Page "${pageName}" — Cloudflare blocked`
      );
    },

    phaseSlow(phase: string, durationMs: number, sloMs: number) {
      log.warn(
        { event: 'job.phase.slow', phase, durationMs, sloMs },
        `${phase} exceeded SLO (${(durationMs / 1000).toFixed(1)}s > ${(sloMs / 1000).toFixed(1)}s)`
      );
    },

    // ─── Detail Events (DEBUG, log file only) ────────────────────

    pageProcessed(pageId: string, pageName: string, durationMs: number, subPhaseResults?: Record<string, unknown>) {
      log.debug(
        { event: 'job.page.processed', pageId, pageName, durationMs, ...subPhaseResults },
        `Processed "${pageName}" (${durationMs}ms)`
      );
    },

    phaseTransition(fromPhase: string, toPhase: string) {
      log.debug(
        { event: 'job.phase.transition', fromPhase, toPhase },
        `Phase transition: ${fromPhase} → ${toPhase}`
      );
    },

    chunkStarted(chunkNumber: number, chunkSize: number) {
      log.debug(
        { event: 'job.chunk.started', chunkNumber, chunkSize },
        `Chunk ${chunkNumber} started (${chunkSize} items)`
      );
    },

    chunkCompleted(chunkNumber: number, itemsProcessed: number, durationMs: number) {
      log.debug(
        { event: 'job.chunk.completed', chunkNumber, itemsProcessed, durationMs },
        `Chunk ${chunkNumber} complete (${itemsProcessed} items, ${durationMs}ms)`
      );
    },

    syncSummary(newPages: number, modifiedPages: number, unchangedPages: number, deletedPages: number) {
      log.debug(
        { event: 'job.sync.summary', newPages, modifiedPages, unchangedPages, deletedPages },
        `Sync: ${newPages} new, ${modifiedPages} modified, ${unchangedPages} unchanged, ${deletedPages} deleted`
      );
    },

    scrapeContentChanged(pageId: string, oldHash: string, newHash: string) {
      log.debug(
        { event: 'job.scrape.content_changed', pageId, oldHash, newHash },
        `Content changed for page ${pageId}`
      );
    },

    ga4Backfill(pageId: string, dateRange: string, snapshotsCreated: number) {
      log.debug(
        { event: 'job.collecting.ga4_backfill', pageId, dateRange, snapshotsCreated },
        `GA4 backfill: ${snapshotsCreated} snapshots for ${dateRange}`
      );
    },

    fillingGaps(gapCount: number, pagesAffected: number) {
      log.debug(
        { event: 'job.filling.gaps', gapCount, pagesAffected },
        `Filling ${gapCount} gaps across ${pagesAffected} pages`
      );
    },

    /** Generic debug for ad-hoc detail logging */
    debug(data: Record<string, unknown>, msg: string) {
      log.debug(data, msg);
    },

    /** Generic info for ad-hoc milestone logging */
    info(data: Record<string, unknown>, msg: string) {
      log.info(data, msg);
    },

    /** Generic warn */
    warn(data: Record<string, unknown>, msg: string) {
      log.warn(data, msg);
    },

    /** Generic error */
    error(data: Record<string, unknown>, msg: string) {
      log.error(data, msg);
    },
  };
}

export type JobLogger = ReturnType<typeof createJobLogger>;
