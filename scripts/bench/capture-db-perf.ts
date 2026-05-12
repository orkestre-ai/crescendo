#!/usr/bin/env npx tsx
/**
 * Capture DB performance snapshot for dashboard + settings surfaces.
 *
 * Usage:
 *   npx tsx scripts/bench/capture-db-perf.ts baseline
 *   npx tsx scripts/bench/capture-db-perf.ts after-task-3
 *
 * Writes: .bench/<label>.json
 *
 * Note on logging: this dev-only script uses `console` directly for progress
 * + summary output, which the runner reads from stdout. The repo's structured
 * logger (src/lib/logging) is for app journeys — JSON with redaction — which
 * would make interactive terminal output unreadable. The eslint-disable below
 * is intentional and scoped to this file.
 */
/* eslint-disable no-console */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// env must be imported AFTER dotenv.config has a chance to run. The Proxy in
// src/config/env.ts defers validation until first access, so this top-level
// import is side-effect-free; validateEnv() fires on the first `env.X` read
// below, by which point process.env has been populated from .env.local.
import { env } from '@/config/env';

const label = process.argv[2];
if (!label) {
  console.error('Usage: npx tsx scripts/bench/capture-db-perf.ts <label>');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]+$/.test(label)) {
  console.error(`Invalid label "${label}" — must match /^[a-zA-Z0-9._-]+$/`);
  process.exit(1);
}

const BASE_URL = env.NEXT_PUBLIC_APP_URL;
const ENDPOINTS = [
  { name: 'dashboard-page', url: `${BASE_URL}/` },
  { name: 'dashboard-summary', url: `${BASE_URL}/api/dashboard/summary` },
  { name: 'settings', url: `${BASE_URL}/api/settings` },
];

const DIRECT_URL = env.POSTGRES_URL_NON_POOLING;

async function resetPgStats() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();
  try {
    await client.query('SELECT pg_stat_statements_reset();');
  } finally {
    await client.end();
  }
}

async function snapshotPgStats() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        calls,
        total_exec_time,
        mean_exec_time,
        rows,
        substring(query, 1, 200) AS query
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
        AND query NOT LIKE '%information_schema%'
      ORDER BY total_exec_time DESC
      LIMIT 30;
    `);
    return rows;
  } finally {
    await client.end();
  }
}

async function ensurePgStatStatements() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`
    );
    if (rows.length === 0) {
      throw new Error(
        `pg_stat_statements extension not installed. Run:\n` +
          `  docker compose exec postgres psql -U postgres -d crescendo -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"\n` +
          `and confirm the 'command:' block in docker-compose.yml preloads it.`
      );
    }
  } finally {
    await client.end();
  }
}

// Subset of autocannon's -j output that we actually read. The failure counters
// are checked so a benchmark that hits 5xx or times out surfaces loudly instead
// of recording misleading "fast" latency numbers for error responses.
type AutocannonResult = {
  errors: number;
  timeouts: number;
  non2xx: number;
  latency: { p50: number; p97_5: number; p99: number };
};

function runAutocannon(url: string): AutocannonResult {
  const raw = execFileSync(
    'npx',
    ['-y', 'autocannon', '-c', '10', '-d', '20', '-j', url],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  let parsed: AutocannonResult;
  try {
    parsed = JSON.parse(raw) as AutocannonResult;
  } catch {
    throw new Error(
      `autocannon returned non-JSON for ${url}: ${raw.slice(0, 200)}`
    );
  }
  if (parsed.errors > 0 || parsed.timeouts > 0 || parsed.non2xx > 0) {
    throw new Error(
      `autocannon failures for ${url}: errors=${parsed.errors} timeouts=${parsed.timeouts} non2xx=${parsed.non2xx} — server likely unhealthy during run`
    );
  }
  return parsed;
}

async function main() {
  console.log(`[bench] label=${label}`);
  await ensurePgStatStatements();
  console.log('[bench] resetting pg_stat_statements...');
  await resetPgStats();

  const endpointResults: Record<string, AutocannonResult> = {};
  for (const ep of ENDPOINTS) {
    console.log(`[bench] autocannon ${ep.name} (${ep.url})...`);
    endpointResults[ep.name] = runAutocannon(ep.url);
  }

  console.log('[bench] snapshotting pg_stat_statements...');
  const queryStats = await snapshotPgStats();

  const output = {
    label,
    capturedAt: new Date().toISOString(),
    endpoints: endpointResults,
    topQueries: queryStats,
  };

  fs.mkdirSync('.bench', { recursive: true });
  const outPath = `.bench/${label}.json`;
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[bench] wrote ${outPath}`);

  console.log('\n=== Endpoint p50/p97.5/p99 (ms) ===');
  for (const ep of ENDPOINTS) {
    const r = endpointResults[ep.name];
    console.log(`  ${ep.name.padEnd(20)}  p50=${r.latency.p50}  p97_5=${r.latency.p97_5}  p99=${r.latency.p99}`);
  }
  console.log('\n=== Top 5 queries by total_exec_time ===');
  for (const q of queryStats.slice(0, 5)) {
    console.log(`  calls=${q.calls}  total=${Number(q.total_exec_time).toFixed(1)}ms  mean=${Number(q.mean_exec_time).toFixed(2)}ms`);
    console.log(`    ${q.query.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
