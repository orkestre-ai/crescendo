#!/usr/bin/env bash
# shutdown.sh — Stop Crescendo (dev or prod). Kills next dev, next start,
# prisma studio, then runs docker-compose down. Safe to run regardless of
# which startup mode was used.
#
# Flags: --verbose, --quiet, --no-color
# CI=true auto-detects plain/no-spinner mode.

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

# ── Temp dir + traps ──────────────────────────────────────────────────────────
RUN_TMPDIR=$(mktemp -d)
SCRIPT_START=$(date +%s)
STEP_TOTAL=3

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

# ── Header ────────────────────────────────────────────────────────────────────
log_info "Shutting down Crescendo (dev or prod)..."
printf "\n" >&2

# ── [1/3] Next.js ─────────────────────────────────────────────────────────────
step_start "Next.js"
pkill -f 'next dev'   2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
step_done

# ── [2/3] Prisma Studio ───────────────────────────────────────────────────────
step_start "Prisma Studio"
pkill -f 'prisma studio' 2>/dev/null || true
lsof -ti:5555 2>/dev/null | xargs kill -9 2>/dev/null || true
step_done

# ── [3/3] Docker containers ───────────────────────────────────────────────────
step_start "Docker containers"
_docker_log="${RUN_TMPDIR}/step-3-docker.log"
run_quietly "${_docker_log}" docker-compose down
step_done

# ── Summary ───────────────────────────────────────────────────────────────────
print_summary "${SCRIPT_START}"
log_ok "All services stopped."
