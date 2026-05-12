#!/usr/bin/env bash
# Crescendo first-run setup — bootstraps a clean clone to a doctor-ready state.
#
# Windows users: run this from Git Bash (ships with Git for Windows).
#                WSL2 is NOT required. PowerShell and cmd.exe are NOT supported.
#                Download: https://git-scm.com/download/win
#
# Tested on: macOS (bash 3.2+), Git Bash on Windows 10/11, Ubuntu (bash 5).
# Windows path is community-tested — maintainer uses macOS only.
#
# What this script does:
#   1. Detects OS/shell; aborts with install hint if unsupported
#   2. Verifies Node 20+, Docker Desktop (running), Git are installed
#   3. Runs `npm install`
#   4. Runs `npx playwright install chromium` (scraping support)
#   5. Copies .env.example to .env.local (ONLY if .env.local is absent)
#   6. Optionally runs `npm run doctor`
#   7. Prints next-steps summary
#
# Report-only: does NOT install Node/Docker/Git on your behalf. Prints hints; you install.
set -e

# ----------------------------------------------------------------------------
# Load shared print helpers (colors, ✓/✗/⚠/ℹ icons, print_header)
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=src/scripts/lib/print.sh
source "$SCRIPT_DIR/src/scripts/lib/print.sh"

# Per-step log files. run_quietly writes command output here; on failure it
# dumps the tail to stderr and prints the full path so the user can investigate.
LOG_DIR="$SCRIPT_DIR/logs/setup"
mkdir -p "$LOG_DIR"

print_header "Crescendo Setup"

# ----------------------------------------------------------------------------
# 1. OS / shell detection (bash 3.2 compatible — uses $OSTYPE, no case-folding)
# ----------------------------------------------------------------------------
case "$OSTYPE" in
  darwin*)              OS=mac ;;
  msys*|cygwin*|mingw*) OS=windows ;;
  linux-gnu*|linux*)    OS=linux ;;
  *)                    OS=unknown ;;
esac

if [ "$OS" = "unknown" ]; then
  print_error "Unsupported shell or OS (\$OSTYPE=$OSTYPE)"
  echo ""
  echo "  On Windows: run this script from Git Bash (part of Git for Windows)."
  echo "    Download: https://git-scm.com/download/win"
  echo "  On macOS/Linux: run from Terminal/bash."
  exit 1
fi
print_success "Detected OS: $OS"

# ----------------------------------------------------------------------------
# 2. Node 20+ check
# ----------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  print_error "Node.js is not installed"
  echo ""
  if [ "$OS" = "mac" ]; then
    echo "  Install with one of:"
    echo "    Homebrew:   brew install node"
    echo "    nvm:        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && nvm install 20"
    echo "    Direct:     https://nodejs.org/ (download Node 20 LTS)"
  elif [ "$OS" = "windows" ]; then
    echo "  Install from: https://nodejs.org/ (download Node 20 LTS installer)"
    echo "  Or with nvm-windows: https://github.com/coreybutler/nvm-windows"
  else
    echo "  Install from: https://nodejs.org/ or via your distro's package manager"
  fi
  exit 1
fi

NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null || echo '')"
NODE_MAJOR="${NODE_VERSION%%.*}"
# Guard against empty string arithmetic (RESEARCH Pitfall 7):
if [ -z "$NODE_MAJOR" ] || ! [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
  print_error "Node.js v$NODE_VERSION found — Node 20+ required"
  echo ""
  echo "  Upgrade via the same tool you installed with (nvm: 'nvm install 20 && nvm use 20')."
  exit 1
fi
print_success "Node.js v$NODE_VERSION"

# ----------------------------------------------------------------------------
# 3. Docker Desktop check (daemon reachable)
# ----------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  print_error "Docker is not installed"
  echo ""
  if [ "$OS" = "mac" ]; then
    echo "  Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  elif [ "$OS" = "windows" ]; then
    echo "  Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    echo "  Requires WSL2 backend (Docker Desktop installer sets this up automatically)."
  else
    echo "  Install Docker Engine: https://docs.docker.com/engine/install/"
  fi
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  print_error "Docker is installed but the daemon is not running"
  if [ "$OS" = "mac" ] || [ "$OS" = "windows" ]; then
    echo "  Start Docker Desktop and re-run this script."
  else
    echo "  Start with: sudo systemctl start docker"
  fi
  exit 1
fi
print_success "Docker daemon is running"

# ----------------------------------------------------------------------------
# 4. Git check (unlikely to fail — they cloned — but verify anyway)
# ----------------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  print_error "Git is not installed"
  echo "  Install from: https://git-scm.com/downloads"
  exit 1
fi
print_success "Git installed: $(git --version | sed 's/^git version //')"

# ----------------------------------------------------------------------------
# 4.5. gcloud CLI check — OPTIONAL, recommended for automated GA4 setup.
# Without it the user falls back to the manual GA4 wizard (5 steps); with it
# they can run `npm run setup:ga4` to provision the service account in ~1 min.
# Warn-only, never blocking.
# ----------------------------------------------------------------------------
if command -v gcloud >/dev/null 2>&1; then
  print_success "gcloud CLI installed: $(gcloud --version 2>/dev/null | head -n1)"
else
  print_warning "gcloud CLI not found (optional — only needed to skip the manual GA4 wizard)"
  if [ "$OS" = "mac" ]; then
    echo "  Install with: brew install --cask google-cloud-sdk"
  elif [ "$OS" = "windows" ]; then
    echo "  Install from: https://cloud.google.com/sdk/docs/install#windows"
  else
    echo "  Install from: https://cloud.google.com/sdk/docs/install"
  fi
fi

# ----------------------------------------------------------------------------
# 5. npm install (idempotent — npm respects package-lock.json)
# Wrapped in run_quietly so the wall of EBADENGINE/deprecation warnings stays
# behind a spinner. Full output lands in $LOG_DIR/npm-install.log; on failure
# the tail is dumped to stderr automatically.
# ----------------------------------------------------------------------------
print_header "Installing dependencies"
if run_quietly "$LOG_DIR/npm-install.log" npm install; then
  print_success "Dependencies installed ($(wc -l <"$LOG_DIR/npm-install.log" | tr -d ' ') lines logged)"
else
  print_error "npm install failed — see $LOG_DIR/npm-install.log for full output"
  exit 1
fi

# ----------------------------------------------------------------------------
# 6. Playwright Chromium (idempotent per Playwright docs — no redownload if present)
# Same wrapping — the playwright installer prints multi-line download progress
# that's noisy when the browser is already cached.
# ----------------------------------------------------------------------------
print_header "Installing Playwright Chromium"
if run_quietly "$LOG_DIR/playwright-install.log" npx playwright install chromium; then
  # Differentiate "already installed" vs "freshly installed" by checking the log.
  if grep -q "is already installed" "$LOG_DIR/playwright-install.log"; then
    print_success "Chromium already installed — skipped"
  else
    print_success "Chromium installed"
  fi
else
  print_error "Playwright install failed — see $LOG_DIR/playwright-install.log for full output"
  exit 1
fi

# ----------------------------------------------------------------------------
# 7. .env.local — copy from .env.example ONLY if absent (NEVER overwrite)
# ----------------------------------------------------------------------------
print_header "Environment file"
if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.local
    print_success "Created .env.local from .env.example"

    # Auto-generate ENCRYPTION_KEY (AES-256 = 32 random bytes, hex-encoded → 64 chars).
    # Without this, the placeholder "your_64_character_hex_key_here" makes
    # PUT /api/settings 500 the first time the user touches encrypted fields.
    # Uses -i.bak for cross-platform sed (GNU sed and BSD sed both accept it).
    if command -v openssl >/dev/null 2>&1; then
      GEN_KEY="$(openssl rand -hex 32)"
      sed -i.bak "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=\"${GEN_KEY}\"|" .env.local
      rm -f .env.local.bak
      print_success "Generated ENCRYPTION_KEY (64-char hex)"
    else
      print_warning "openssl not found — generate ENCRYPTION_KEY manually:"
      print_warning '  node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))"'
    fi

    print_warning "Edit .env.local to add your API credentials before running the app"
  else
    print_error ".env.example not found at repo root — cannot create .env.local"
    exit 1
  fi
else
  print_success ".env.local already exists — skipping copy (your credentials are safe)"
fi

# ----------------------------------------------------------------------------
# 7.5. Database bootstrap — start PostgreSQL container and apply migrations.
# Without this, `npm run doctor` (next step) and `npm run startup` (next-steps
# summary) both fail their doctor gate because the DB container does not exist
# yet on a fresh clone. Idempotent: `up -d` is a no-op if container is running;
# `migrate deploy` is a no-op if all migrations are already applied.
#
# Contributors making schema changes: edit prisma/schema.prisma, then run
# `npx prisma migrate dev --name <change>` to generate a new migration.
# Commit both schema.prisma and the new prisma/migrations/<timestamp>_<name>/
# directory in the same PR.
# ----------------------------------------------------------------------------
print_header "Database bootstrap"

# Try `docker compose` (plugin, newer Docker Desktop) first, fall back to
# `docker-compose` (standalone binary, older installs).
DB_STARTED=0
if docker compose up -d postgres >/dev/null 2>&1; then
  DB_STARTED=1
elif docker-compose up -d postgres >/dev/null 2>&1; then
  DB_STARTED=1
fi

if [ "$DB_STARTED" = "1" ]; then
  print_success "PostgreSQL container started"
  printf "  Waiting for PostgreSQL to accept connections"
  DB_READY=0
  for _i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    if docker exec crescendo-db pg_isready -U postgres >/dev/null 2>&1; then
      DB_READY=1
      break
    fi
    printf "."
    sleep 1
  done
  echo ""

  if [ "$DB_READY" = "1" ]; then
    print_success "PostgreSQL is ready"
    # Prisma CLI auto-loads `.env`, NOT `.env.local`. Source `.env.local` into
    # a subshell so POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING reach prisma
    # without leaking exports into the rest of setup.sh. `set -a` auto-exports
    # every var defined while it is on.
    if [ -f .env.local ]; then
      # shellcheck disable=SC1091
      (
        set -a
        source .env.local
        set +a
        # migrate deploy is the non-interactive, production-safe variant — no
        # prompts, no schema generation. Applies any committed migrations from
        # prisma/migrations in order. No-op if all are already applied. On
        # failure, surfaces the actual error rather than swallowing it.
        npx prisma migrate deploy
      )
      PRISMA_EXIT=$?
      if [ "$PRISMA_EXIT" = "0" ]; then
        print_success "Database migrations applied"
      else
        print_warning "Migration step did not complete cleanly — see output above"
      fi
    else
      print_warning ".env.local not found — skipping migration step"
    fi
  else
    print_warning "PostgreSQL did not become ready in 30s — doctor will report this"
  fi
else
  print_warning "Could not start PostgreSQL container (docker-compose.yml missing or invalid?)"
  print_warning "Skipping database bootstrap — doctor will report any issues"
fi

# ----------------------------------------------------------------------------
# 8. Optional doctor run
# Capture exit code so the final header can reflect whether issues were found.
# ----------------------------------------------------------------------------
echo ""
# `-n 1` reads a single character; default is Yes on Enter.
read -p "Run doctor now to validate the setup? [Y/n] " -n 1 -r REPLY
echo ""
DOCTOR_EXIT=0
DOCTOR_RAN=0
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  DOCTOR_RAN=1
  # Doctor may exit non-zero (reds) — do not abort setup.sh; user still wants the summary.
  npm run doctor || DOCTOR_EXIT=$?
fi

# ----------------------------------------------------------------------------
# 9. Next-steps summary
# Header reflects doctor result so users don't see a green "complete" right
# after a red doctor failure.
# ----------------------------------------------------------------------------
if [ "$DOCTOR_RAN" = "1" ] && [ "$DOCTOR_EXIT" != "0" ]; then
  print_header "Setup finished with issues"
  echo "  Doctor reported one or more red issues (see output above)."
  echo "  Common fixes:"
  echo "    - Edit .env.local and replace any \"your_...\" placeholder values"
  echo "    - Open Settings UI after first launch to test EN / GA4 connections"
  echo ""
  echo "  Resolve the issues above, then run:"
  echo "    npm run doctor    (re-check)"
  echo "    npm run start:dev (start the app)"
else
  print_header "Setup complete"
  echo "  Next steps:"
  echo "    1. Edit .env.local with your credentials (EN, GA4, Anthropic)"
  echo "    2. Run:  npm run start:dev"
  echo "    3. Open: http://localhost:3000"
fi
echo ""
echo "  Step logs:    $LOG_DIR"
echo "  Rerun this script any time — it is idempotent."
echo ""
