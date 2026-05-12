/**
 * Captures observable behavior of a job run: normalized log events +
 * DB row counts + sample rows. Output is used by diff-trace.ts.
 *
 * Runs against the trace DB only. Refuses to run against POSTGRES_URL.
 */

// Load .env.local before anything reads env.
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { parseArgs } from 'node:util';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

type JobType = 'SYNC' | 'MANUAL_SCRAPE' | 'MANUAL_RECS' | 'BACKFILL';

const SAMPLE_TABLES = [
  'collectionJob',
  'fundraisingPage',
  'performanceSnapshot',
  'contentSnapshot',
  'fundraisingSnapshot',
  'optimizationRecommendation',
] as const;

function assertTraceDb(): string {
  const traceUrl = process.env.TRACE_DATABASE_URL;
  if (!traceUrl) throw new Error('TRACE_DATABASE_URL is not set.');
  if (traceUrl === process.env.POSTGRES_URL) {
    throw new Error('TRACE_DATABASE_URL must not equal POSTGRES_URL.');
  }
  return traceUrl;
}

async function main() {
  const { values } = parseArgs({
    options: {
      type: { type: 'string' },
      out: { type: 'string' },
    },
  });

  const jobType = values.type as JobType | undefined;
  const outPath = values.out;

  if (!jobType || !outPath) {
    throw new Error('Usage: capture-trace.ts --type <JobType> --out <path>');
  }

  const traceUrl = assertTraceDb();

  // Per-run log file to avoid racing with the app's logs/dev-logs.json.
  const runLogPath = path.resolve(`/tmp/trace-run-${Date.now()}.log`);
  process.env.LOG_FILE = runLogPath;

  // CORRECTION: Re-seed BEFORE overriding POSTGRES_URL so the spawned seeder's
  // assertTraceDb() check (TRACE !== POSTGRES) still passes. The seeder does
  // its own in-process override when it connects Prisma.
  execSync('npx tsx src/scripts/seed-trace-fixture.ts', { stdio: 'inherit' });

  // Now override env for the dynamic imports below.
  process.env.POSTGRES_URL = traceUrl;
  process.env.POSTGRES_PRISMA_URL = traceUrl;
  process.env.POSTGRES_URL_NON_POOLING = traceUrl;
  process.env.DATABASE_URL = traceUrl;

  // Dynamic imports so env overrides land before Prisma / jobs module load.
  const { prisma } = await import('../lib/db');
  const { jobProcessor } = await import('../lib/jobs');

  // Create + process the job.
  // Signature: createCollectionJob(triggeredBy: string, jobType: JobType)
  const job = await jobProcessor.createCollectionJob('trace-capture', jobType);

  await jobProcessor.processJobToCompletion(job.id, { maxIterations: 100 });

  // Collect row counts.
  const rowCounts: Record<string, number> = {};
  for (const table of SAMPLE_TABLES) {
    // @ts-expect-error — table key indexes Prisma client
    rowCounts[table] = await prisma[table].count();
  }

  // Collect sample rows (first 3 by id).
  const sampleRows: Record<string, unknown[]> = {};
  for (const table of SAMPLE_TABLES) {
    // @ts-expect-error — table key indexes Prisma client
    sampleRows[table] = await prisma[table].findMany({
      take: 3,
      orderBy: { id: 'asc' },
    });
  }

  // Read log lines emitted during this run. Filter by jobId.
  let logLines: string[] = [];
  if (existsSync(runLogPath)) {
    logLines = readFileSync(runLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .filter((line) => line.includes(job.id));
  }

  const trace = {
    traceDatabaseUrl: traceUrl,
    capturedAt: new Date().toISOString(),
    gitSha: execSync('git rev-parse HEAD').toString().trim(),
    jobType,
    jobId: job.id,
    logLines,
    rowCounts,
    sampleRows,
  };

  writeFileSync(outPath, JSON.stringify(trace, null, 2));
  console.log(`Wrote trace → ${outPath}`);
  console.log(`  events: ${logLines.length}`);
  console.log(`  rows: ${Object.entries(rowCounts).map(([k, v]) => `${k}=${v}`).join(' ')}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
