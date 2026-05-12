# Development Scripts

Quick reference for managing your development environment.

## Starting the Development Environment

### One-Command Startup (Recommended)

```bash
npm run startup
```

This will:

- ✅ Check if Docker is running
- ✅ Start PostgreSQL database in Docker (port 54320)
- ✅ Wait for database to be ready
- ✅ Check for and kill any existing Next.js server processes
- ✅ Check for and kill any existing Prisma Studio processes
- ✅ Clear ports 3000 and 5555
- ✅ Start Next.js dev server on port 3000
- ✅ Start Prisma Studio on port 5555

The script ensures a clean start every time!

**Note:** Make sure Docker Desktop is running before executing this command.

## Stopping Services

### Stop Everything (Recommended)

```bash
npm run shutdown
```

Cleanly stops Next.js, Prisma Studio, and Docker containers.

### Stop App Services Only

```bash
npm run kill:all
```

Kills Next.js and Prisma Studio but leaves Docker running.

### Stop Next.js Only

```bash
npm run kill:next
```

Kills only the Next.js server, leaves Prisma Studio running.

### Stop Prisma Only

```bash
npm run kill:prisma
```

Kills only Prisma Studio, leaves Next.js running.

### Stop by Port

```bash
npm run kill
```

Kills anything running on port 3000 (Next.js default port).

## GA4 Credential Setup

```bash
npm run setup:ga4
```

Automates the entire Google Analytics 4 credential setup using the `gcloud` CLI. Creates a Google Cloud project, service account, and JSON key, then lets you pick your GA4 property from a list and writes everything to `.env.local`.

**Requires**: `gcloud` CLI and `jq` installed.

## Manual Startup (Individual Services)

If you prefer to start services separately:

```bash
# Start Next.js only
npm run dev

# Start Prisma Studio only (in another terminal)
npx prisma studio
```

## Common Issues

**Port already in use?**

- Run `npm run startup` - it will automatically kill existing processes

**Services won't stop?**

- Run `npm run kill:all` to force kill all services
- Check running processes: `lsof -ti:3000,5555`

**Need to restart?**

- Just run `npm run startup` again - it handles cleanup automatically

## URLs

After running `npm run startup`, these services will be available:

- **Next.js App**: http://localhost:3000
- **Prisma Studio**: http://localhost:5555
- **pgAdmin**: http://localhost:50500 (login: admin@localhost.com / admin)
- **PostgreSQL**: localhost:54320 (user: postgres / pass: postgres)

## Database Access

You can connect to the PostgreSQL database using:

- **pgAdmin** (GUI): http://localhost:50500
- **Prisma Studio** (GUI): http://localhost:5555
- **psql** (CLI): `psql -h localhost -p 54320 -U postgres -d crescendo`
- **Connection string**: `postgresql://postgres:postgres@localhost:54320/crescendo`
