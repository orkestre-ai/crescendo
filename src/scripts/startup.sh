#!/usr/bin/env bash
# startup.sh — Start the Crescendo development environment.
#
# What changed from the original:
#  • set -Eeuo pipefail + IFS hardening + ERR trap (file, line, exit code)
#  • tput colors gated on TTY + NO_COLOR; ASCII fallbacks for CI / piped output
#  • all log output goes to stderr; stdout reserved for data
#  • step framework: [N/TOTAL] counters, per-step timing, ✓ / ✗ on completion
#  • noise suppression: subcommand output → temp log + spinner; dump 50 lines inline on fail
#  • cleanup trap: removes temp logs on success, preserves + prints path on failure
#  • --verbose (stream live), --quiet (errors only), --no-color; CI=true auto-detects
#  • idempotency: dependency step checks timestamps; migration step always runs (prisma is idempotent)
#  • final summary: total time, steps run / skipped, log location

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Flag parsing ──────────────────────────────────────────────────────────────
VERBOSE=0
QUIET=0
NO_COLOR_FLAG=0

for arg in "$@"; do
  case "${arg}" in
    --verbose)  VERBOSE=1 ;;
    --quiet)    QUIET=1 ;;
    --no-color) NO_COLOR_FLAG=1 ;;
    *) printf "Unknown flag: %s\nUsage: %s [--verbose] [--quiet] [--no-color]\n" \
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

# ERR fires on any non-zero exit not explicitly handled with || or if/while.
# run_quietly already prints context on failure; this catches everything else.
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
  log_info "Starting development environment..."
  printf "\n" >&2
fi

# ── Prereq: Docker (not a step — gate before we start counting) ───────────────
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

# ── [1/5] PostgreSQL ──────────────────────────────────────────────────────────
step_start "PostgreSQL"

_pg_log="${RUN_TMPDIR}/step-1-postgres.log"
run_quietly "${_pg_log}" docker-compose up -d postgres

# Busy-wait for pg_isready; the container may be up but Postgres still initialising
_timeout=30
_counter=0
while ! docker-compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  if [[ ${_counter} -ge ${_timeout} ]]; then
    log_error "Database did not become ready within ${_timeout}s"
    exit 1
  fi
  # Inline wait indicator (non-spinner; run_quietly's spinner is already done)
  if [[ -t 2 ]] && [[ "${CI:-}" != "true" ]]; then
    printf "\r   waiting for pg_isready... %ds" "${_counter}" >&2
  fi
  sleep 1
  _counter=$(( _counter + 1 ))
done
[[ -t 2 ]] && printf "\r\033[K" >&2

step_done
log_info "PostgreSQL ready on port 54320"

# ── [2/5] Dependencies ────────────────────────────────────────────────────────
step_start "Node.js dependencies"

# Skip if node_modules exists and is newer than both manifest files
if [[ -d node_modules ]] \
   && [[ ! package.json      -nt node_modules ]] \
   && [[ ! package-lock.json -nt node_modules ]]; then
  step_skip
else
  _npm_log="${RUN_TMPDIR}/step-2-npm.log"
  run_quietly "${_npm_log}" npm install
  step_done
fi

# ── [3/6] Prisma client generation ────────────────────────────────────────────
step_start "Prisma client"

# Idempotent — fast (<1s) when client is up to date. Catches the case where
# node_modules exists (skipping npm install) but .prisma/client was deleted.
_generate_log="${RUN_TMPDIR}/step-3-generate.log"
run_quietly "${_generate_log}" npx prisma generate
step_done

# ── [4/6] Prisma migrations ───────────────────────────────────────────────────
step_start "Database migrations"

# prisma migrate deploy is idempotent — safe to always run; no skip needed
_prisma_log="${RUN_TMPDIR}/step-4-prisma.log"
run_quietly "${_prisma_log}" npx prisma migrate deploy
step_done

# ── [5/6] Health check ────────────────────────────────────────────────────────
step_start "Health check"

# doctor.ts formats its own output; let it write directly to stderr.
# Using `|| capture` keeps errexit and the ERR trap suppressed for this
# command, so a non-zero exit (warnings = 2) doesn't print a spurious
# "Aborted at line N" before the warning handler below.
DOCTOR_RC=0
npx tsx src/scripts/doctor.ts >&2 || DOCTOR_RC=$?

if [[ "${DOCTOR_RC}" -eq 1 ]]; then
  log_error "Doctor found critical issues. Fix them and re-run: npm run start:dev"
  exit 1
elif [[ "${DOCTOR_RC}" -eq 2 ]]; then
  log_warn "Doctor reported warnings — continuing startup."
fi

step_done

# ── [6/6] Next.js dev server ──────────────────────────────────────────────────
step_start "Next.js dev server"

# Clear any process already holding port 3000
if lsof -ti:3000 >/dev/null 2>&1; then
  log_warn "Port 3000 in use — clearing existing process..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Kill stale Next.js processes by name
pkill -f 'next dev'   2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true

mkdir -p logs
# tee -a preserves existing log history across restarts
PORT=3000 npm run dev 2>&1 | tee -a logs/nextjs.log &
sleep 2

# Check by process name rather than $! (which would be tee's PID via the pipe)
if ! pgrep -f 'next dev' >/dev/null 2>&1; then
  log_error "Next.js failed to start. Check logs/nextjs.log for details."
  exit 1
fi

step_done

# ── Ready banner ──────────────────────────────────────────────────────────────
printf "\n" >&2
printf "%s\n"    "${BOLD}${GREEN}  Development environment is ready!${NC}"        >&2
printf "\n" >&2
printf "  %-18s %s\n" "PostgreSQL:"    "${GREEN}localhost:54320${NC}"              >&2
printf "  %-18s %s\n" "Next.js:"       "${GREEN}http://localhost:3000${NC}"        >&2
printf "  %-18s %s\n" "pgAdmin:"       "${GREEN}http://localhost:50500${NC}  (admin@localhost.com / admin)" >&2
printf "  %-18s %s\n" "Prisma Studio:" "${YELLOW}npx prisma studio${NC}  (run manually)" >&2
printf "\n" >&2
printf "  To stop:  %s\n" "${YELLOW}npm run shutdown${NC}"                         >&2

print_summary "${SCRIPT_START}" "${RUN_TMPDIR}"
