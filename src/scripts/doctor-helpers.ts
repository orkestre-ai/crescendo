/**
 * Pure-logic helpers for the Crescendo doctor CLI.
 *
 * This file MUST have zero side effects on import. No `process.exit`, no I/O at
 * module scope, no `console.log`. Everything must be safely importable from tests.
 */

export type Verdict = 'green' | 'yellow' | 'red';

export interface Check {
  name: string;
  verdict: Verdict;
  detail?: string;
  remediation?: string;
}

/**
 * Roll up a list of checks to a process exit code.
 *
 * Semantics (D-02):
 *   0 = all green (or empty list)
 *   1 = at least one red (hard failure) — takes precedence over yellows
 *   2 = yellows only, zero reds
 */
export function rollUpExit(checks: Check[]): number {
  if (checks.some((c) => c.verdict === 'red')) return 1;
  if (checks.some((c) => c.verdict === 'yellow')) return 2;
  return 0;
}

/**
 * Compare a Node version string (e.g. "20.10.0") against the minimum
 * required major version (20+). Returns a Check with a remediation string
 * when the version is below minimum.
 */
export function checkNodeVersion(version: string): Check {
  // Normalise: strip a leading "v" if present (process.versions.node is unprefixed,
  // but some callers may pass "v20.10.0").
  const v = version.replace(/^v/, '');
  const major = Number.parseInt(v.split('.')[0] ?? '0', 10);

  if (Number.isFinite(major) && major >= 20) {
    return { name: 'Node.js', verdict: 'green', detail: `v${v}` };
  }

  return {
    name: 'Node.js',
    verdict: 'red',
    detail: `v${v} — Node 20+ required`,
    remediation:
      'Install Node 20 LTS from https://nodejs.org or run: nvm install 20 && nvm use 20',
  };
}

/**
 * Match common placeholder shapes in a .env.local file:
 *   FOO=your_secret_here
 *   FOO="your_secret_here"
 *   FOO='your_secret_here'
 *   FOO=...
 *
 * We look for `=` followed by an optional quote, then either `your_...`
 * (any snake_case token starting with `your_`) or a bare `...` ellipsis.
 * The /m flag lets `^` / `$` match line boundaries.
 */
const PLACEHOLDER_RE = /=["']?your_[a-z0-9_]+["']?|=["']?\.{3}["']?/gi;

/**
 * Parse a .env.local file body and count placeholder-shaped values.
 * Zero placeholders = green. >0 placeholders = yellow.
 */
export function parseEnvLocal(contents: string): { placeholders: number } {
  const matches = contents.match(PLACEHOLDER_RE) ?? [];
  return { placeholders: matches.length };
}

/**
 * True when a raw env-var value looks like an unfilled placeholder rather
 * than a real credential. Catches the shapes used in .env.example:
 *   your_anthropic_api_key  → starts with your_
 *   sk-ant-api03-...        → ends with ... (the literal ellipsis)
 *   ...                     → just the ellipsis
 */
export function looksPlaceholderValue(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return true;
  return /^your_[a-z0-9_]+$/i.test(trimmed) || trimmed.endsWith('...');
}

/** How many days of quiet before a cached connection verdict is considered stale. */
const STALE_DAYS = 7;

/**
 * A cached connection-test result is "stale" when it has never been run (null)
 * or when more than STALE_DAYS have elapsed since the last run.
 */
export function isStale(d: Date | null): boolean {
  if (!d) return true;
  return Date.now() - d.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}
