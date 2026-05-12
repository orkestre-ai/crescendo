# Getting Started

How to launch Crescendo locally for the first time. Plan for about 15 minutes — most of it is spent waiting on `npm install` and Playwright's Chromium download.

This guide targets **developers** who want to run Crescendo in development mode (Next.js dev server + Postgres in Docker). If you want to run the full app in Docker without a local dev environment, see the Quick Start section in [README.md](README.md) instead.

## 0. What you'll need before you start

### On your machine

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac or Windows) — must be **running**, not just installed
- [Node.js 20+](https://nodejs.org/) — check with `node --version`
- [Git](https://git-scm.com/downloads)
- **Windows only:** [Git for Windows](https://git-scm.com/download/win), which ships with Git Bash. All subsequent commands must run inside Git Bash — **not** PowerShell or cmd.exe.

### Credentials you'll collect along the way

See [Credential Setup Guide](docs/guides/credential-setup.md) for step-by-step walkthroughs of each.

| Credential | Required? | Where to get it |
|---|---|---|
| Engaging Networks REST API token | yes | EN admin → Settings → API |
| GA4 Property ID (format `properties/123456789`) | yes | GA4 admin → Property Settings |
| GA4 service account key (JSON, single-line) | yes | Google Cloud Console → IAM → Service Accounts → create → download JSON |
| `ENCRYPTION_KEY` (64-char hex) | yes | generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Anthropic API key | optional (disables AI features if missing) | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| EN Public API token | optional (enables NetDonor fundraising data) | EN admin → Settings → API → Public Token |

You don't need all of these before step 1 — `./setup.sh` will create a `.env.local` with placeholders that you can fill in later.

## 1. Clone and bootstrap

```bash
git clone https://github.com/orkestre-ai/crescendo.git
cd crescendo
./setup.sh
```

`./setup.sh` is the guided bootstrap. It will:

1. Detect your OS and shell
2. Verify Node 20+, Docker Desktop running, Git installed (and print install hints for anything missing)
3. Run `npm install` (~1–2 min on a good connection)
4. Install Playwright Chromium (~1 min, ~200 MB download — used for scraping Cloudflare-protected donation pages)
5. Copy `.env.example` → `.env.local` if you don't have one yet (won't overwrite an existing `.env.local`)
6. Optionally run `npm run doctor` to validate the setup

**`./setup.sh` is idempotent.** Rerun it any time — steps already done are skipped.

## 2. Fill in your credentials

Open `.env.local` in your editor. Replace the placeholder values — anything containing `your_...`, `sk-ant-api03-...`, or `properties/123456789` — with your real credentials. The database URLs at the top of the file are already correct for Docker Compose; don't change them.

Save the file, then re-run the health check:

```bash
npm run doctor
```

You want all checks to show ✓ green. If anything is yellow or red, the doctor prints a `fix:` hint next to the failing check — follow the hint and re-run.

## 3. Start the dev environment

```bash
npm run start:dev
```

This runs an orchestrated startup pipeline:

1. Start PostgreSQL (if it's stopped between runs)
2. Verify dependencies are installed
3. Apply any pending Prisma migrations
4. Run `doctor` to verify environment health (fails fast if something is misconfigured)
5. Launch `next dev` with hot reload

Expected output (abbreviated):

```
[1/5] PostgreSQL              ✓
[2/5] Dependencies            ✓
[3/5] Migrations              ✓
[4/5] Doctor                  ✓
[5/5] Next.js dev server      ✓

  ▲ Next.js 15.5
  - Local:  http://localhost:3000

  Prisma Studio:  npx prisma studio  (run manually)
```

Open [http://localhost:3000](http://localhost:3000). You should see the dashboard.

If this is your first run and no pages have been synced yet, click **Refresh** in the top right to pull your EN donation pages, then wait a couple of minutes for GA4 metrics to populate.

### Running a production build instead

If you want to run the optimized production build locally:

```bash
npm run start:prod
```

Same pipeline as `start:dev` through step 4, then `next build` (skipped if `.next/BUILD_ID` already exists) and `next start`. Pass `--build` to force a rebuild:

```bash
npm run start:prod -- --build
```

## 4. Day-to-day commands

```bash
npm run start:dev    # start dev environment (Postgres + Next.js dev server)
npm run start:prod   # start production environment (Postgres + Next.js prod build)
npm run shutdown     # stop everything (Next.js, Prisma Studio, Postgres)
npm run doctor       # re-check environment health any time
```

Prisma Studio (the database GUI) does **not** auto-launch. Start it manually when you need it:

```bash
npx prisma studio
```

It opens at [http://localhost:5555](http://localhost:5555). `npm run shutdown` will stop it cleanly along with everything else.

Settings are also editable in the app at [http://localhost:3000/settings](http://localhost:3000/settings) — you can rotate API keys there without editing `.env.local`.

## Troubleshooting

**Doctor shows `⚠ .env.local — N placeholder value(s) still present`**
You haven't replaced all the `your_...` values in `.env.local` yet. Open it and fill them in. The app will start but anything that uses those credentials will fail.

**Doctor shows `✗ PostgreSQL — not reachable`**
The Postgres container isn't running. Run `docker compose up -d postgres` manually, or re-run `./setup.sh` — it's idempotent and will start the container for you.

**"Container name '/crescendo-db' is already in use"**
You have a leftover stopped container from a previous run. Run `docker start crescendo-db` to reuse it. Your data lives in a Docker volume and survives this.

**Port 3000 / 5555 / 54320 already in use**
Another process (or a previous instance of Crescendo that didn't shut down cleanly) is holding the port. Run `npm run kill:all` to clear them, then `npm run start:dev` again.

**"Node.js v18.x.x found — Node 20+ required"**
Upgrade Node. With `nvm`: `nvm install 20 && nvm use 20`. With Homebrew: `brew install node@20`. Then re-run `./setup.sh`.

**Mac M-series: `docker exec` complains about platform**
The Postgres image (`postgres:15-alpine`) has native ARM64 builds; this usually resolves by running `docker compose pull postgres` once to fetch the ARM variant, then retrying.

**Windows users getting `bash: setup.sh: No such file or directory`**
Make sure you're inside Git Bash (not PowerShell or cmd.exe), and make sure your clone isn't on a WSL path that Git Bash can't see. Shortcut: right-click the cloned folder in Explorer → **Open Git Bash here**.

## What you're getting

A local instance with:

- Your EN donation pages synced and visible on the dashboard
- Daily QUICK collection (GA4 metrics + EN fundraising data) running in the background
- Nightly DEEP scan (page scraping + AI recommendations) if the Anthropic key is set
- Prisma Studio available at [http://localhost:5555](http://localhost:5555) (run `npx prisma studio` to launch)
- Settings UI at [http://localhost:3000/settings](http://localhost:3000/settings) for rotating API keys without editing `.env.local`

## See also

- [Credential Setup Guide](docs/guides/credential-setup.md) — detailed walkthroughs for obtaining each credential
- [Docker Setup Guide](docs/guides/docker-setup.md) — advanced database configuration and troubleshooting
- [Debugging Guide](docs/guides/debugging.md) — log inspection, job tracing, common error patterns
- [Technical Reference](docs/TECHNICAL-REFERENCE.md) — architecture, data flow, and API reference
