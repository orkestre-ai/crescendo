# Phase 12 script tests

Node's built-in test runner (Node 20+) drives these tests. No framework install required.

## Run

```bash
npm run test:scripts                        # all tests
npx tsx --test src/scripts/__tests__/doctor.test.ts   # one file
```

## Fixtures

`fixtures/env.local.fixture` — clean `.env.local` with realistic-but-fake values; used for doctor green-verdict tests. Database name is `crescendo` (matches `.env.example` and docker-compose.yml).

`fixtures/env.local.placeholders.fixture` — `.env.local` with `your_...` placeholders derived from `.env.example`; used for yellow-verdict tests.

Fixtures are read-only test inputs. Tests must NEVER write them; copy into a `tmp/` directory if a test needs a mutable filesystem target.

## Rules

- Tests must not hit a real database. Use Prisma client mocks or DI-injected callers (see doctor.ts helpers for the seam).
- Tests must not make outbound network calls.
- Tests must complete in < 5 seconds total.
