# DB Performance Benchmark Harness

One command captures `p50/p97.5/p99` latency + `pg_stat_statements` totals for the dashboard and settings endpoints.

## Prerequisites

- Postgres running with `pg_stat_statements` preloaded (see `docker-compose.yml` command block).
- App running on `localhost:3000` (`npm run dev` or `npm run startup`).
- `.env.local` has `POSTGRES_URL_NON_POOLING` (used for direct stat reads).

## Usage

```bash
npx tsx scripts/bench/capture-db-perf.ts <label>
# writes .bench/<label>.json, prints summary to stdout
```

## What each run does

1. `SELECT pg_stat_statements_reset();` — clear query counters.
2. `autocannon -c 10 -d 20 -j <url>` for each of `/`, `/api/dashboard/summary`, `/api/settings`.
3. Snapshot top 30 queries by `total_exec_time` (excluding stats-introspection queries themselves).
4. Write everything to `.bench/<label>.json`.

## Limitations (known, not shortcomings to fix)

- Uses your dev DB + dev server. Prod behavior differs (connection pool size, JIT, etc.).
- The first request after restart is always slow (cold Next.js route cache). `autocannon -d 20` gives enough samples that this is noise-level.
- pg_stat_statements has a `track=all` setting, so stored-procedure-internal queries show too.

## Reading the output

Compare `p50 / p97_5 / p99` of an endpoint across two labels. `mean_exec_time` on the top query tells you where the DB is spending time. `calls` tells you if a fix eliminated a query entirely.
