/**
 * Structurally compares two traces captured by capture-trace.ts.
 * Exits 0 if behaviorally equivalent, 1 with a diff report otherwise.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';

interface Trace {
  traceDatabaseUrl: string;
  jobId: string;
  jobType: string;
  logLines: string[];
  rowCounts: Record<string, number>;
  sampleRows: Record<string, unknown[]>;
}

const STRIP_PATTERNS = [
  /"timestamp":"[^"]*"/g,
  /"time":\d+/g,
  /"[a-zA-Z]*[Dd]uration(Ms)?":\d+/g, // durationMs, totalDuration, chunkDuration, phaseDuration, pageDuration, etc.
  /"elapsed[A-Za-z]*":\d+/g,
  /"pid":\d+/g,
  /"hostname":"[^"]*"/g,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, // UUIDs
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g,                  // ISO dates
];

const UUID_PLACEHOLDER = '<UUID>';
const DATE_PLACEHOLDER = '<DATE>';

function normalizeLine(line: string, jobId: string): string | null {
  // Replace full jobId (CUID) + any 8-char prefix used in truncated log messages.
  const shortJobId = jobId.slice(0, 8);
  let normalized = line.split(jobId).join('<JOB_ID>').split(shortJobId).join('<JOB_ID_SHORT>');
  for (const pattern of STRIP_PATTERNS) {
    normalized = normalized.replace(pattern, (match) => {
      if (/^\d{4}-\d{2}-\d{2}T/.test(match)) return DATE_PLACEHOLDER;
      if (/^[0-9a-f]{8}-/.test(match)) return UUID_PLACEHOLDER;
      return '';
    });
  }
  return normalized;
}

function extractPhase(line: string): string {
  const match = line.match(/"phase":"([A-Z_]+)"/);
  return match ? match[1] : 'UNPHASED';
}

function groupAndSort(lines: string[], jobId: string): string[] {
  const byPhase = new Map<string, string[]>();
  for (const line of lines) {
    const normalized = normalizeLine(line, jobId);
    if (!normalized) continue;
    const phase = extractPhase(line);
    if (!byPhase.has(phase)) byPhase.set(phase, []);
    byPhase.get(phase)!.push(normalized);
  }
  const result: string[] = [];
  for (const phase of Array.from(byPhase.keys()).sort()) {
    result.push(...byPhase.get(phase)!.sort());
  }
  return result;
}

function stripVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileFields);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (['id', 'createdAt', 'updatedAt', 'fetchedAt', 'startedAt',
           'completedAt', 'gaCollectedAt', 'enCollectedAt', 'lastSyncedAt',
           'lastScrapedAt', 'fundraisingLastFetchedAt'].includes(k)) {
        continue;
      }
      out[k] = stripVolatileFields(v);
    }
    return out;
  }
  return value;
}

function main() {
  const { values } = parseArgs({
    options: {
      before: { type: 'string' },
      after: { type: 'string' },
    },
  });

  if (!values.before || !values.after) {
    throw new Error('Usage: diff-trace.ts --before <path> --after <path>');
  }

  const before = JSON.parse(readFileSync(values.before, 'utf8')) as Trace;
  const after = JSON.parse(readFileSync(values.after, 'utf8')) as Trace;

  // Safety: don't compare traces from different DBs.
  if (before.traceDatabaseUrl !== after.traceDatabaseUrl) {
    console.error(`Refusing to compare traces from different DBs:`);
    console.error(`  before: ${before.traceDatabaseUrl}`);
    console.error(`  after:  ${after.traceDatabaseUrl}`);
    process.exit(1);
  }

  if (before.jobType !== after.jobType) {
    console.error(`Job type mismatch: ${before.jobType} vs ${after.jobType}`);
    process.exit(1);
  }

  const problems: string[] = [];

  // Compare normalized log traces.
  const beforeLines = groupAndSort(before.logLines, before.jobId);
  const afterLines = groupAndSort(after.logLines, after.jobId);

  if (beforeLines.length !== afterLines.length) {
    problems.push(`log line count: ${beforeLines.length} → ${afterLines.length}`);
  }
  for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
    if (beforeLines[i] !== afterLines[i]) {
      problems.push(`line ${i} differs:\n  - ${beforeLines[i]}\n  + ${afterLines[i]}`);
      if (problems.length > 10) break;
    }
  }

  // Compare row counts.
  for (const table of Object.keys(before.rowCounts)) {
    if (before.rowCounts[table] !== after.rowCounts[table]) {
      problems.push(
        `rowCounts[${table}]: ${before.rowCounts[table]} → ${after.rowCounts[table]}`
      );
    }
  }

  // Compare sample rows (volatile fields stripped).
  for (const table of Object.keys(before.sampleRows)) {
    const b = JSON.stringify(stripVolatileFields(before.sampleRows[table]));
    const a = JSON.stringify(stripVolatileFields(after.sampleRows[table]));
    if (b !== a) {
      problems.push(`sampleRows[${table}] differ`);
    }
  }

  if (problems.length === 0) {
    console.log(`✓ traces equivalent (${beforeLines.length} events, job type: ${before.jobType})`);
    process.exit(0);
  }

  console.error(`✗ traces differ:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

main();
