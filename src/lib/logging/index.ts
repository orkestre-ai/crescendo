/**
 * Logging Service — Pino-based structured logging
 *
 * Journey-oriented logging with correlation keys for tracing
 * job lifecycles, chat sessions, explorations, and API calls.
 *
 * @example
 * import { rootLogger } from '@/lib/logging';
 *
 * const log = rootLogger.child({ journey: 'job', jobId: 'abc-123' });
 * log.info({ phase: 'SYNCING', pages: 47 }, '▸ SYNCING — 47 pages');
 */

import pino from 'pino';
import { getRedactionConfig } from './redaction';

const isDev = process.env.NODE_ENV !== 'production';

export const rootLogger = pino({
  level: isDev ? 'debug' : 'info',
  redact: getRedactionConfig(),
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDev
    ? {
        targets: [
          {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              singleLine: false,
              levelFirst: true,
            },
            level: 'info', // Console: milestones only
          },
          {
            target: 'pino/file',
            options: { destination: 'logs/dev-logs.json', mkdir: true },
            level: 'debug', // File: everything
          },
          ...(process.env.LOG_FILE
            ? [
                {
                  target: 'pino/file',
                  options: { destination: process.env.LOG_FILE, mkdir: true },
                  level: 'debug',
                },
              ]
            : []),
        ],
      }
    : undefined, // Production: raw JSON to stdout
});

// Journey loggers are imported directly from '@/lib/logging/journeys'
