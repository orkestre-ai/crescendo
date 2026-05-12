# Crescendo

Crescendo by Orkestre AI. Fundraising page optimizer for Engaging Networks. Syncs donation pages, collects analytics, scrapes content, and generates AI optimization recommendations.

**Default branch**: `main`

## Stack

- Next.js 15.5 / React 19 / TypeScript 5.9 / Node.js 22+
- Prisma 7.8 (driver-adapter architecture via `@prisma/adapter-pg`) + PostgreSQL (Docker)
- Tailwind CSS 4.1 + shadcn/ui
- axios, zod 4.1, recharts, date-fns, p-limit

## Project Structure

```
src/
  app/
    (dashboard)/           # Dashboard (page list) and settings pages
      pages/[id]/          # Page detail view
      settings/            # Integration settings
    api/
      chat/                # AI chat with history
      cron/                # daily-collection (QUICK), nightly-deep-scan (DEEP), cleanup
      dashboard/summary/   # Dashboard summary stats
      database/            # Database summary stats
      debug/               # Logs, EN test
      explorations/        # Exploration CRUD with reordering
      jobs/                # Job CRUD, process, health, cleanup
      pages/               # Page list, detail, fundraising, snapshots
      recommendations/     # List, dismiss, implement
      settings/            # Settings CRUD, EN/GA4 test, sync, clear
      snapshots/           # Content snapshot management
      version/             # App version + GitHub release check (1-hour cache)
  components/
    ai-config/             # AI chat tools, model config, explorations panels
    dashboard/             # Page table, refresh button, summary cards
    help/                  # Help drawer and content renderer
    job-status/            # Job progress card
    layout/                # Header, sidebar
    page-detail/           # Metrics, recommendations, trends, gateway
    settings/              # Integration forms
    ui/                    # shadcn/ui primitives
  lib/
    ai-client.ts           # AI provider abstraction (Claude, streaming)
    ai-stream.ts           # Server-sent event streaming for AI chat
    analytics.ts           # Analytics helper utilities
    claude.ts              # Claude AI recommendation generator
    cleanup.ts             # Shared data cleanup logic
    crypto.ts              # AES-256-GCM encryption for stored keys
    currency-utils.ts      # Currency formatting
    date-utils.ts          # Date formatting helpers
    db.ts                  # Prisma client singleton
    en-public-client.ts    # EN Public API client (NetDonor fundraising data)
    engaging-networks.ts   # EN REST API client (page sync)
    errors.ts              # Custom error classes (CloudflareBlockedError, etc.)
    gateway-detection.ts   # Payment gateway extraction
    google-analytics.ts    # GA4 reporting client
    jobs.ts                # JobProcessor: phase routing, runs to completion
    playwright-scraper.ts  # Playwright browser singleton
    prompt-utils.ts        # AI prompt construction helpers
    rate-limit.ts          # Rate limiting utilities
    scheduler.ts           # In-process node-cron scheduler
    scraper.ts             # Web scraper (axios + Playwright CF fallback)
    screenshot-storage.ts  # Screenshot storage (local filesystem)
    settings.ts            # App settings helpers
    snapshot-utils.ts      # Content snapshot helpers
    tracking-utils.ts      # Analytics tracking utilities
    url-utils.ts           # URL parsing/building utilities
    utils.ts               # General utility functions
    validation.ts          # Input validation helpers
    version.ts             # Version comparison and display utilities
    ai/                    # AI provider config, tools registry, type definitions
    ai-tools/              # AI tool implementations (GA4, page performance, snapshots)
    logging/               # Structured logger (journeys, redaction)
  types/                   # TypeScript type definitions
  config/
    env.ts                 # Zod-validated environment variables
    constants.ts           # App constants (concurrency, thresholds, etc.)
prisma/
  schema.prisma            # Database schema
docs/
  api/                     # API references (engaging-networks.md, google-analytics.md)
  guides/                  # Setup guides (credentials, docker, debugging)
  debugging/               # Debugging references
  TECHNICAL-REFERENCE.md   # Consolidated architecture and data-flow reference
```

## Commands

```bash
# Orchestrated startup / shutdown
npm run start:dev        # Dev: PostgreSQL → deps → migrations → doctor → next dev
npm run start:prod       # Prod: PostgreSQL → deps → migrations → doctor → next build → next start
npm run shutdown         # Stop everything (next dev/start, prisma studio, postgres)
npm run startup          # Back-compat alias for start:dev

# Raw build commands (no DB bootstrap — assumes start:* already ran)
npm run dev              # Next.js dev server only
npm run build            # Production build
npm start                # next start (use start:prod for the full bootstrap)
npm run lint             # ESLint
npm run format           # Prettier
npm run type-check       # tsc --noEmit

# Process management
npm run kill             # Kill port 3000
npm run kill:next        # Kill Next.js processes
npm run kill:prisma      # Kill Prisma Studio
npm run kill:all         # Kill all dev processes

# Logging
npm run logs:tail        # Tail structured app logs (dev-logs.json)
npm run logs:trace       # Trace a specific job/request through logs

# Setup
./setup.sh               # First-run bootstrap (prereqs, deps, .env.local)
npm run doctor           # Environment + credentials health check
npm run setup:ga4        # Automated GA4 credential setup (requires gcloud + jq)

# Database
docker-compose up -d                       # Start PostgreSQL + pgAdmin
docker-compose down                        # Stop containers
npx prisma studio                          # Database GUI
npx prisma migrate deploy                  # Apply pending migrations (used by setup.sh)
npx prisma migrate dev --name <change>     # Author a new migration after editing schema.prisma
npm run db:status                          # Check migration status
npm run db:check                           # Verify schema is in sync

# Docker (self-service)
docker compose up        # Start everything (postgres, app, auto-migrate)
docker compose down      # Stop everything
docker compose down -v   # Stop and delete data volumes

# Test scripts
npm run test:scripts                              # Run script unit tests (doctor-helpers, fixtures)
npx tsx src/scripts/test-netdonor.ts              # Test EN Public API connection
npx tsx src/scripts/test-netdonor.ts --all         # Test all pages with campaign IDs
npx tsx src/scripts/test-netdonor.ts --page <id> --save  # Fetch and save to DB
```

## Architecture

### Job System

Two job types with distinct phase pipelines:

```
QUICK: SYNCING → COLLECTING → FINALIZING
DEEP:  SCRAPING → GENERATING_RECS → FINALIZING
```

- **QUICK**: Syncs page list from EN, collects GA4 metrics + NetDonor fundraising data
- **DEEP**: Scrapes page content (with Playwright fallback for Cloudflare), generates Claude AI recommendations

Jobs process all pages per phase and run to completion. Use `POST /api/jobs/{id}/process` for manual recovery.

### External Integrations

| Service            | Client                          | Auth                                 |
| ------------------ | ------------------------------- | ------------------------------------ |
| EN REST API        | `src/lib/engaging-networks.ts`  | Token (auto-authenticates)           |
| EN Public API      | `src/lib/en-public-client.ts`   | Query param token (optional)         |
| Google Analytics 4 | `src/lib/google-analytics.ts`   | Service account JSON                 |
| Anthropic Claude   | `src/lib/claude.ts`             | API key                              |
| Web scraping       | `src/lib/scraper.ts`            | None (axios + Playwright)            |
| Local filesystem   | `src/lib/screenshot-storage.ts` | None (configurable `SCREENSHOT_DIR`) |

### Known Constraints

- Cloudflare blocks some EN pages: detected and skipped gracefully
- EN REST API: rate limited, 3x retry with exponential backoff on 429
- Claude recommendations: 500ms delay between pages, 5/batch
- Screenshots: local filesystem (configurable via `SCREENSHOT_DIR`)

## Environment Variables

Validated via zod in `src/config/env.ts`.

| Variable                   | Required | Notes                                                  |
| -------------------------- | -------- | ------------------------------------------------------ |
| `POSTGRES_URL`             | Yes      | Connection string (pooled)                             |
| `POSTGRES_PRISMA_URL`      | Yes      | Prisma-specific connection                             |
| `POSTGRES_URL_NON_POOLING` | Yes      | Migrations/seeding                                     |
| `EN_API_TOKEN`             | Yes      | EN REST API token                                      |
| `EN_BASE_URL`              | No       | Default: `https://ca.engagingnetworks.app/ens/service` |
| `EN_PUBLIC_TOKEN`          | No       | NetDonor fundraising data                              |
| `EN_REGION`                | No       | `us` or `ca` (default: `ca`)                           |
| `GA4_PROPERTY_ID`          | Yes      | Format: `properties/123456789`                         |
| `GA4_SERVICE_ACCOUNT_KEY`  | Yes      | Service account JSON string                            |
| `ANTHROPIC_API_KEY`        | No       | Starts with `sk-ant-` (optional, for AI recommendations) |
| `NEXT_PUBLIC_APP_URL`      | No       | Default: `http://localhost:3000`                       |
| `CRON_SECRET`              | No       | Optional, for external cron triggering via curl        |
| `SCREENSHOT_DIR`           | No       | Defaults to `public/screenshots`                       |
| `ENABLE_SCHEDULER`         | No       | Defaults to `true`                                     |
| `SYNC_DEBUG_LIMIT`         | No       | Limit sync to N most-recently-modified pages (0 = no limit) |
| `REBROWSER_ENABLED`        | No       | `"true"` to use rebrowser-playwright for scraping      |
| `WEBSHARE_PROXY_HOST`      | No       | Proxy hostname (e.g. `p.webshare.io`)                  |
| `WEBSHARE_PROXY_PORT`      | No       | Proxy port (e.g. `80`)                                 |
| `WEBSHARE_PROXY_USER`      | No       | Webshare username                                      |
| `WEBSHARE_PROXY_PASS`      | No       | Webshare password                                      |

## Code Style

- TypeScript strict mode
- Path aliases: `@/*` → `src/*`
- Prettier with single quotes
- ESLint with Next.js config

## Working Agreements

Bias toward caution over speed. Use judgment on trivial tasks.

- **Surface uncertainty before coding.** State assumptions explicitly. If a request has multiple reasonable interpretations, ask — don't pick silently. If a simpler approach exists, say so and push back when warranted.
- **Minimum code that solves the problem.** No speculative features, configurability, or abstractions for single-use code. No error handling for scenarios that can't happen. If 200 lines could be 50, rewrite.
- **Surgical changes only.** Every changed line should trace directly to the user's request. Don't "improve" adjacent code or refactor things that aren't broken. Match existing style. Remove only the orphans your own changes created — mention pre-existing dead code, don't delete it.
- **Define verifiable success.** Translate "add X" / "fix Y" / "refactor Z" into a check you can run (test passes, command exits 0, page renders without error, doctor green). Loop until the check passes — don't claim done on assertion alone.

## Key Docs

- [EN REST API Reference](docs/api/engaging-networks.md)
- [GA4 API Reference](docs/api/google-analytics.md)
- [Credential Setup Guide](docs/guides/credential-setup.md)
- [Docker Setup](docs/guides/docker-setup.md)
- [Debugging Guide](docs/guides/debugging.md)
- [Technical Reference](docs/TECHNICAL-REFERENCE.md)

## Logs and Debugging

There are TWO separate log systems. Agents MUST read BOTH when debugging or monitoring the app.

### `logs/nextjs.log` — stdout (framework-level)

Captured from terminal via `tee`. Contains Next.js HTTP request logs and Prisma SQL queries:

```
 GET /api/jobs?status=PENDING&limit=1 200 in 9ms
prisma:query SELECT "public"."CollectionJob"."id" ...
```

Use this to see: every HTTP request/response, SQL queries, route timing, framework errors.

### `logs/dev-logs.json` — structured app logs (business-level)

Written by the app's logger. Contains job lifecycle events, API call tracking, processing status:

```
[2026-03-05T15:20:23Z] INFO job.phase.entering → Entering GENERATING_RECS phase
[2026-03-05T15:20:30Z] INFO api.request.completed → Completed /messages
```

Use this to see: job phases, page processing, Claude API calls, chunk progress, errors with context.

### Agent instructions

When debugging, monitoring jobs, or investigating errors:

```bash
tail -100 logs/nextjs.log      # Recent HTTP requests + SQL queries
tail -100 logs/dev-logs.json   # Recent app events (job phases, API calls)
npm run logs:tail              # Live tail of structured app logs
npm run logs:trace             # Trace a specific job/request through logs
```

Read BOTH log files. `nextjs.log` shows what happened at the infrastructure level (routes hit, queries run). `dev-logs.json` shows what happened at the application level (which job phase, which page, what failed). You need both to get the full picture.
