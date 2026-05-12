# Changelog

All notable changes to Crescendo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.6.0] - 2026-05-12

Initial open-source release of Crescendo by Orkestre AI, licensed under [AGPL-3.0](LICENSE).

### Features

- **Dashboard** — page list with conversion, revenue, and traffic metrics; on-demand refresh with live job progress.
- **Engaging Networks integration** — REST API for page sync, Public API (NetDonor) for fundraising data, automatic retry/backoff, Cloudflare-aware scraping with Playwright fallback.
- **Google Analytics 4 integration** — page-level metrics, conversion tracking, trend analysis (7/30/90-day).
- **AI recommendations** — multi-provider via Vercel AI SDK (Claude, GPT, Gemini, Ollama); chat with streaming responses and 5 built-in tools.
- **Configurable explorations** — drag-and-drop reordering, persistent chat history with continuation.
- **Snapshots** — content change detection with hash-based staleness; full snapshot history per page.
- **Job system** — two pipelines (QUICK: sync + metrics; DEEP: scrape + AI) with node-cron scheduling, manual recovery, and structured logging.
- **Payment gateway detection** — Stripe, VGS, and payment method identification.
- **Security** — AES-256-GCM encryption for stored credentials, URL allowlist with hostname suffix matching, per-route rate limiting.

### Infrastructure

- Self-hosted Docker Compose setup (PostgreSQL + app, automatic schema migration on boot).
- Next.js 15.5 / React 19 / TypeScript 5.9 / Node.js 22+.
- Prisma 7 with driver-adapter architecture.
- AGPL-3.0 license, contributor guidelines, and security policy.
- Public release at [orkestre-ai/crescendo](https://github.com/orkestre-ai/crescendo).

[Unreleased]: https://github.com/orkestre-ai/crescendo/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/orkestre-ai/crescendo/releases/tag/v0.6.0
