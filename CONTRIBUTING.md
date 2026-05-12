# Contributing to Crescendo

Thank you for your interest in contributing to Crescendo! This project is licensed under the [AGPL-3.0](LICENSE) (GNU Affero General Public License v3.0), and all contributions must be under the same license.

## Development Setup

1. **Fork and clone** the repository
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start PostgreSQL:**
   ```bash
   docker compose up -d postgres
   ```
4. **Create environment file:**
   ```bash
   cp .env.example .env.local
   ```
   Note: Next.js reads `.env.local` for local development. Docker Compose reads `.env`. These are separate files with different purposes.
5. **Add your API credentials** to `.env.local`. See [docs/guides/credential-setup.md](docs/guides/credential-setup.md) for details on obtaining and configuring each credential.
6. **Initialize the database:**
   ```bash
   npx prisma migrate deploy
   ```
   Applies the baseline migration (and any subsequent migrations). Idempotent — safe to rerun. For a guided one-shot install instead, use `./setup.sh` from the repo root.
7. **Start the development server:**
   ```bash
   npm run startup
   ```

## Database Schema Changes

Crescendo uses Prisma's managed migration workflow. To change the schema:

1. Edit `prisma/schema.prisma`
2. Generate a migration:
   ```bash
   npx prisma migrate dev --name <descriptive_name>
   ```
3. Commit both `prisma/schema.prisma` and the new `prisma/migrations/<timestamp>_<name>/` directory in the same PR.

For schema validation only (no DB changes), run `npm run db:check`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run type-check` | TypeScript type checking (`tsc --noEmit`) |
| `npm run startup` | Start everything (PostgreSQL, Next.js, Prisma Studio) |
| `npm run shutdown` | Stop all services |
| `npm run logs:tail` | Tail structured app logs |
| `npm run logs:trace` | Trace a specific job/request through logs |

## Coding Standards

- **TypeScript strict mode** is enabled project-wide
- **Prettier** with single quotes for formatting (`npm run format`)
- **ESLint** with Next.js configuration (`npm run lint`)
- **Path aliases:** `@/*` maps to `src/*`

See `CLAUDE.md` for the full project structure and conventions.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all checks pass:
   ```bash
   npm run type-check
   npm run lint
   npm run build
   ```
4. Open a pull request using the PR template
5. Accept the CLA checkbox in the PR template

## License Agreement

By contributing to Crescendo, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE) (GNU Affero General Public License v3.0). All pull requests require acceptance of this agreement via the CLA checkbox in the PR template.
