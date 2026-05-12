/**
 * Client-side Structured Logger
 *
 * Lightweight logger for React components. Replaces raw console.error/warn
 * with structured output that includes component name and action.
 *
 * Only error and warn go to browser console. Info is dev-only debug output.
 *
 * @example
 * import { clog } from '@/lib/client-logger';
 * clog.error('refresh-button', 'trigger-failed', { error: err.message });
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

function clientLog(
  level: LogLevel,
  component: string,
  action: string,
  data?: Record<string, unknown>
) {
  const entry = { ...data, ts: new Date().toISOString(), level, component, action };

  if (level === 'error' || level === 'warn') {
    console[level](`[${component}] ${action}`, data ?? '');
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug('[client]', JSON.stringify(entry));
  }
}

export const clog = {
  error: (component: string, action: string, data?: Record<string, unknown>) =>
    clientLog('error', component, action, data),
  warn: (component: string, action: string, data?: Record<string, unknown>) =>
    clientLog('warn', component, action, data),
  info: (component: string, action: string, data?: Record<string, unknown>) =>
    clientLog('info', component, action, data),
};
