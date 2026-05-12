# Verification Harness

Used by sub-project 1 (`jobs.ts` split) and sub-projects 2 and 3 to verify refactors don't change observable behavior.

## One-time setup

1. Create the trace database:
   ```bash
   docker exec crescendo-db createdb -U postgres crescendo_trace
   ```
2. Add to `.env.local`:
   ```env
   TRACE_DATABASE_URL=postgresql://postgres:postgres@localhost:54320/crescendo_trace
   ```
3. Apply the baseline migration to the trace DB:
   ```bash
   POSTGRES_URL="postgresql://postgres:postgres@localhost:54320/crescendo_trace" \
   POSTGRES_PRISMA_URL="postgresql://postgres:postgres@localhost:54320/crescendo_trace" \
   POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@localhost:54320/crescendo_trace" \
   DATABASE_URL="postgresql://postgres:postgres@localhost:54320/crescendo_trace" \
   npx prisma migrate deploy
   ```

## Workflow

**Capture a baseline** (once, before any refactor):
```bash
npx tsx src/scripts/seed-trace-fixture.ts
npx tsx src/scripts/capture-trace.ts --type SYNC         --out baselines/sync-baseline.json
npx tsx src/scripts/capture-trace.ts --type MANUAL_SCRAPE --out baselines/manual-scrape-baseline.json
npx tsx src/scripts/capture-trace.ts --type MANUAL_RECS  --out baselines/manual-recs-baseline.json
npx tsx src/scripts/capture-trace.ts --type BACKFILL     --out baselines/backfill-baseline.json
```

**After each risky commit** replay and diff:
```bash
npx tsx src/scripts/capture-trace.ts --type SYNC --out /tmp/after-sync.json
npx tsx src/scripts/diff-trace.ts --before baselines/sync-baseline.json --after /tmp/after-sync.json
```

Exit 0 → commit. Exit 1 → revert, debug, retry.

## Safety

`capture-trace.ts` refuses to run if:
- `TRACE_DATABASE_URL` is unset.
- `TRACE_DATABASE_URL` equals `POSTGRES_URL` (prevents wiping the dev DB).

`diff-trace.ts` refuses to compare two traces whose captured `traceDatabaseUrl` metadata fields differ.

## External-API drift

Trace runs hit live EN and GA4 APIs. If a page's EN state changes between baseline capture and a later run, diff-trace may false-positive. Recapture the baseline if this happens.

## Current baseline coverage (2026-04-17)

Only `MANUAL_RECS` is captured reliably today. `SYNC`, `MANUAL_SCRAPE`, and `BACKFILL` all traverse the scraping / EN-sync paths, which intermittently crash with `P2025` during the parallel scraping progress update. See `.planning/todos/pending/2026-04-17-collection-job-update-race-in-scraping-phase.md`. Until that race is fixed, those baselines cannot be trusted.

Consequence for the `jobs.ts` split (sub-project 1):
- Task 12 (extract `processRecommendationPhase`) is trace-diff verified against `baselines/manual-recs-baseline.json`.
- Tasks 11, 13, 14, 15 rely on `npm run type-check` + `npm run lint` + mechanical transformation discipline + a final end-to-end smoke test at Task 17.

Additional harness limitations tracked separately:
- `.planning/todos/pending/2026-04-17-trace-harness-live-api-flakiness.md` — trace runs depend on the user's live EN org, not a hermetic fixture.
- `.planning/todos/pending/2026-04-17-trace-fixture-needs-realistic-snapshots-to-exercise-ai-paths.md` — current fixture skips every page in GENERATING_RECS due to no snapshot data.
