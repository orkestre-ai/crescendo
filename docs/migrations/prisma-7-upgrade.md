# Prisma 6 → 7 upgrade — DONE

**Status:** completed in PR (Prisma 7.8.0, ^7.8.0 pinned)
**Originally planned for:** Dependabot PR #21 (closed in favor of this dedicated migration)

## What actually changed in Prisma 7

The original plan in this doc only captured one breaking change (datasource URLs moving out of `schema.prisma`). The bigger architectural shift surfaced during execution:

**Prisma 7 dropped the Rust query engine.** A `PrismaClient` now requires either:
- A **driver adapter** (e.g. `@prisma/adapter-pg`), which uses the `pg` package directly, OR
- A **Prisma Accelerate URL** (paid hosted service)

Source: `node_modules/@prisma/client/runtime/client.d.ts:2012` —
*"Since Prisma 7, a PrismaClient needs either an adapter or an accelerateUrl."*

This made the upgrade more invasive than the original plan: every `PrismaClient` construction in the codebase had to be rewritten.

## What was changed

| File | Change |
|------|--------|
| `package.json` | `prisma` and `@prisma/client` → `^7.8.0`; added `@prisma/adapter-pg` `^7.8.0`; removed the `"prisma": { "seed": … }` block (moved to `prisma.config.ts`). |
| `prisma.config.ts` (new) | Holds `datasource.url` (uses `POSTGRES_URL_NON_POOLING` for migrations) and `migrations.seed`. |
| `prisma/schema.prisma` | Removed `url`/`directUrl` from `datasource db`. Removed `binaryTargets` (Rust engine is gone). |
| `src/lib/db.ts` | Constructs `PrismaPg(process.env.POSTGRES_PRISMA_URL!)` and passes as `adapter` to `PrismaClient`. |
| `prisma/seed.ts` | Same adapter pattern, using `POSTGRES_URL_NON_POOLING` (falls back to pooled URL). |
| `src/lib/ai-tools/__tests__/test-db.ts` | Replaced deprecated `datasources: { db: { url } }` option with adapter. |
| `src/components/page-detail/content-section.tsx` | `JsonValue` import moved from `@prisma/client/runtime/library` (removed in v7) to `Prisma.JsonValue` from `@prisma/client`. |
| `.github/dependabot.yml` | Removed `prisma` and `@prisma/client` from the major-version ignore list. |
| `CLAUDE.md` | Updated stack line to reflect Prisma 7 + adapter architecture. |

## Verification (all passed)

- [x] `npx prisma generate` → "Generated Prisma Client (v7.8.0)"
- [x] `npx prisma migrate status` → "Database schema is up to date!"
- [x] `npm run type-check` clean
- [x] `npm run lint` — 0 errors (84 pre-existing warnings unchanged)
- [x] `npm run test:scripts` — 26/26 passed
- [x] `npm run doctor` green for Prisma
- [x] Runtime smoke test: `prisma.fundraisingPage.count()` and `prisma.collectionJob.count()` returned expected values (239 pages, 1 job)

## Notes for future migrations

- The `binaryTargets` line in `schema.prisma` is no longer needed in v7 with adapters — the Rust engine binaries it referenced no longer exist.
- `PrismaClientOptions` no longer accepts `datasources: { db: { url } }` — only `adapter` or `accelerateUrl`. Any test or alt-DB code that used that pattern needs the same adapter rewrite.
- `JsonValue` is no longer exported from `@prisma/client/runtime/library`. Use `Prisma.JsonValue` from `@prisma/client` instead.
- The `prisma migrate` CLI auto-loads `.env`, not `.env.local`. The setup scripts already source `.env.local` into a subshell when running migrations; that pattern still works in v7.
