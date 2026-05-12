#!/usr/bin/env bash
# startup-prod.sh — Start the Crescendo production environment.
#
# Mirrors startup.sh but takes the production path:
#   PostgreSQL → deps → migrations → doctor → next build → next start
#
# Flags: --verbose, --quiet, --no-color, --build (force a rebuild even if
#        .next/BUILD_ID already exists). CI=true auto-detects plain mode.

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Flag parsing ──────────────────────────────────────────────────────────────
VERBOSE=0
QUIET=0
NO_COLOR_FLAG=0
FORCE_BUILD=0

for arg in "$@"; do
  case "${arg}" in
    --verbose)  VERBOSE=1 ;;
    --quiet)    QUIET=1 ;;
    --no-color) NO_COLOR_FLAG=1 ;;
    --build)    FORCE_BUILD=1 ;;
    *) printf "Unknown flag: %s\nUsage: %s [--verbose] [--quiet] [--no-color] [--build]\n" \
         "${arg}" "$0" >&2; exit 1 ;;
  esac
done

export VERBOSE QUIET NO_COLOR_FLAG

# shellcheck source=lib/print.sh
source "${SCRIPT_DIR}/lib/print.sh"

# ── Temp dir for per-step logs ────────────────────────────────────────────────
RUN_TMPDIR=$(mktemp -d)
SCRIPT_START=$(date +%s)

# ── Traps ─────────────────────────────────────────────────────────────────────
cleanup() {
  local rc=$?
  if [[ ${rc} -eq 0 ]]; then
    rm -rf "${RUN_TMPDIR}"
  else
    log_warn "Step logs preserved at: ${RUN_TMPDIR}"
  fi
}

err_handler() {
  log_error "Aborted at line ${1}: ${BASH_COMMAND} (exit $?)"
}

trap cleanup EXIT
trap 'err_handler ${LINENO}' ERR

STEP_TOTAL=6

# ── ASCII header ──────────────────────────────────────────────────────────────
if [[ "${QUIET}" == "0" ]]; then
  printf "%s" "${GREEN}" >&2
  cat >&2 << 'BANNER'

                                                                 888
                                                                 888
                                                                 888
 .d8888b 888d888 .d88b.  .d8888b   .d8888b .d88b.  88888b.   .d88888  .d88b.
d88P"    888P"  d8P  Y8b 88K      d88P"   d8P  Y8b 888 "88b d88" 888 d88""88b
888      888    88888888 "Y8888b. 888     88888888 888  888 888  888 888  888
Y88b.    888    Y8b.          X88 Y88b.   Y8b.     888  888 Y88b 888 Y88..88P
 "Y8888P 888     "Y8888   88888P'  "Y8888P "Y8888  888  888  "Y88888  "Y88P"

BANNER
  printf "%s\n" "${NC}" >&2
  log_info "Starting production environment..."
  printf "\n" >&2
fi

# ── Prereq: Docker (not a step — gate before counting) ────────────────────────
if ! docker info >/dev/null 2>&1; then
  log_error "Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

# ── Load .env.local so prisma / doctor / scheduler see POSTGRES_URL_*, etc. ──
# Next.js auto-loads .env.local at runtime; CLI tools (prisma) only read .env.
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
else
  log_warn ".env.local not found — prisma and doctor may fail. Run ./setup.sh to create it."
fi

# NODE_ENV is set inline on the final `npm start` call so it only affects
# next start, not `npm install` (which would skip devDeps like dotenv) or
# `npx tsx` (doctor.ts needs dev-only tooling).

# ── [1/6] PostgreSQL ──────────────────────────────────────────────────────────
step_start "PostgreSQL"

_pg_log="${RUN_TMPDIR}/step-1-postgres.log"
run_quietly "${_pg_log}" docker-compose up -d postgres

# Busy-wait for pg_isready; container may be up but Postgres still initialising.
_timeout=30
_counter=0
while ! docker-compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  if [[ ${_counter} -ge ${_timeout} ]]; then
    log_error "Database did not become ready within ${_timeout}s"
    exit 1
  fi
  if [[ -t 2 ]] && [[ "${CI:-}" != "true" ]]; then
    printf "\r   waiting for pg_isready... %ds" "${_counter}" >&2
  fi
  sleep 1
  _counter=$(( _counter + 1 ))
done
[[ -t 2 ]] && printf "\r\033[K" >&2

step_done
log_info "PostgreSQL ready on port 54320"

# ── [2/6] Dependencies ────────────────────────────────────────────────────────
step_start "Node.js dependencies"

# Skip if node_modules exists and is newer than both manifest files.
if [[ -d node_modules ]] \
   && [[ ! package.json      -nt node_modules ]] \
   && [[ ! package-lock.json -nt node_modules ]]; then
  step_skip
else
  _npm_log="${RUN_TMPDIR}/step-2-npm.log"
  run_quietly "${_npm_log}" npm install
  step_done
fi

# ── [3/6] Prisma migrations ───────────────────────────────────────────────────
step_start "Database migrations"

# prisma migrate deploy is idempotent — safe to always run; no skip needed.
_prisma_log="${RUN_TMPDIR}/step-3-prisma.log"
run_quietly "${_prisma_log}" npx prisma migrate deploy
step_done

# ── [4/6] Health check ────────────────────────────────────────────────────────
step_start "Health check"

# doctor.ts formats its own output. `|| capture` keeps errexit/ERR trap from
# firing on warnings (rc=2), which would otherwise dump a spurious "Aborted".
DOCTOR_RC=0
npx tsx src/scripts/doctor.ts >&2 || DOCTOR_RC=$?

if [[ "${DOCTOR_RC}" -eq 1 ]]; then
  log_error "Doctor found critical issues. Fix them and re-run: npm run start:prod"
  exit 1
elif [[ "${DOCTOR_RC}" -eq 2 ]]; then
  log_warn "Doctor reported warnings — continuing startup."
fi

step_done

# ── [5/6] Production build ────────────────────────────────────────────────────
step_start "Production build"

# Skip the build if a complete .next/ already exists. Pass --build to force.
# BUILD_ID is the last file Next writes, so its presence implies a clean build.
if [[ "${FORCE_BUILD}" == "0" ]] && [[ -f .next/BUILD_ID ]]; then
  step_skip
  log_info "Using existing build in .next/ — pass --build to rebuild"
else
  _build_log="${RUN_TMPDIR}/step-5-build.log"
  run_quietly "${_build_log}" npm run build
  step_done
fi

# ── [6/6] Next.js production server ───────────────────────────────────────────
step_start "Next.js production server"

# Clear any process already holding port 3000.
if lsof -ti:3000 >/dev/null 2>&1; then
  log_warn "Port 3000 in use — clearing existing process..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Kill stale Next.js processes by name (dev or prod).
pkill -f 'next dev'   2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true

mkdir -p logs
# tee -a preserves existing log history across restarts.
PORT=3000 NODE_ENV=production npm start 2>&1 | tee -a logs/nextjs.log &

# Wait for port 3000 to bind. Next 15 rewrites the process title to
# "next-server (vX.Y.Z)" once started, so a pgrep for "next start" would
# miss it — checking the listening port is the universal signal.
_ready=0
for _i in 1 2 3 4 5 6 7 8 9 10; do
  if lsof -ti:3000 >/dev/null 2>&1; then
    _ready=1
    break
  fi
  sleep 1
done

if [[ ${_ready} -eq 0 ]]; then
  log_error "Next.js failed to bind port 3000 within 10s. Check logs/nextjs.log."
  exit 1
fi

step_done

# ── Ready banner ──────────────────────────────────────────────────────────────
printf "\n" >&2
printf "%s\n"    "${BOLD}${GREEN}  Production environment is ready!${NC}"           >&2
printf "\n" >&2
printf "  %-18s %s\n" "PostgreSQL:"    "${GREEN}localhost:54320${NC}"               >&2
printf "  %-18s %s\n" "Next.js:"       "${GREEN}http://localhost:3000${NC}  (production)" >&2
printf "  %-18s %s\n" "pgAdmin:"       "${GREEN}http://localhost:50500${NC}  (admin@localhost.com / admin)" >&2
printf "\n" >&2
printf "  Logs:     %s\n" "${YELLOW}tail -f logs/nextjs.log${NC}"                   >&2
printf "  To stop:  %s\n" "${YELLOW}npm run shutdown${NC}"                          >&2

print_summary "${SCRIPT_START}" "${RUN_TMPDIR}"
