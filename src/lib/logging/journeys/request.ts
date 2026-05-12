/**
 * Request Journey Logger
 *
 * Factory for per-route child loggers. Silent in console —
 * all events go to log file at DEBUG.
 *
 * Correlation key: requestId
 */

import { randomUUID } from 'crypto';
import { rootLogger } from '../index';

export function createRequestLogger(method: string, path: string) {
  const requestId = randomUUID().slice(0, 8);
  const log = rootLogger.child({ journey: 'request', requestId, method, path });

  return {
    raw: log,
    requestId,

    /** Log request received — DEBUG (file only) */
    started() {
      log.debug({ event: 'http.request' }, `${method} ${path}`);
    },

    /** Log request completed with status — DEBUG (file only) */
    completed(statusCode: number, durationMs: number) {
      log.debug(
        { event: 'http.request', statusCode, durationMs },
        `${method} ${path} → ${statusCode} (${durationMs}ms)`
      );
    },

    /** Log request error — ERROR (console + file) */
    error(statusCode: number, err: Error) {
      log.error(
        { event: 'http.error', statusCode, err },
        `${method} ${path} → ${statusCode}`
      );
    },

    /** Generic debug for route-specific detail */
    debug(data: Record<string, unknown>, msg: string) {
      log.debug(data, msg);
    },
  };
}

export type RequestLogger = ReturnType<typeof createRequestLogger>;
