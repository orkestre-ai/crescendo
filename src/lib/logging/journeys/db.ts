/**
 * Database Journey Logger
 *
 * Logs Prisma query events routed through Pino.
 * Console shows WARN+ only (slow queries, connection errors).
 * All query detail goes to log file at DEBUG.
 *
 * Correlation key: inherits from parent context
 */

import { rootLogger } from '../index';

const log = rootLogger.child({ journey: 'db' });

export const dbLogger = {
  raw: log,

  // ─── Console Events (WARN+) ────────────────────────────────

  slowQuery(query: string, durationMs: number) {
    log.warn(
      { event: 'db.query.slow', durationMs },
      `Slow query (${durationMs}ms): ${query.slice(0, 120)}`
    );
  },

  connectionError(err: Error) {
    log.error(
      { event: 'db.connection.error', err },
      `Database connection error`
    );
  },

  // ─── Detail Events (DEBUG) ─────────────────────────────────

  query(query: string, durationMs: number) {
    log.debug(
      { event: 'db.query', durationMs },
      query.slice(0, 200)
    );
  },

  transaction(operationCount: number, durationMs: number) {
    log.debug(
      { event: 'db.transaction', operationCount, durationMs },
      `Transaction: ${operationCount} ops (${durationMs}ms)`
    );
  },
};
