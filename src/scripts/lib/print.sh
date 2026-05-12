#!/usr/bin/env bash
# Crescendo shared print + step framework.
# Source with: source "$(dirname "${BASH_SOURCE[0]}")/lib/print.sh"
# Bash 5+ required (macOS: brew install bash; Linux: system bash is usually 5+).
# No `set -e` here — caller controls error posture.
#
# Caller exports before sourcing:
#   VERBOSE=0|1   — stream subcommand output live instead of suppressing it
#   QUIET=0|1     — suppress everything except errors
#   NO_COLOR_FLAG=0|1

VERBOSE="${VERBOSE:-0}"
QUIET="${QUIET:-0}"
NO_COLOR_FLAG="${NO_COLOR_FLAG:-0}"

# CI=true auto-detects plain mode
[[ "${CI:-}" == "true" ]] && NO_COLOR_FLAG=1

# ── Color / TTY detection ─────────────────────────────────────────────────────
# Gate color on: stderr is a tty AND NO_COLOR is unset AND flag is off.
# Writing to stderr keeps stdout clean for data output.
_tty_ok() { [[ -t 2 ]] && [[ "${NO_COLOR_FLAG}" == "0" ]] && [[ -z "${NO_COLOR:-}" ]]; }

if _tty_ok; then
  RED=$(tput setaf 1 2>/dev/null    || printf '\033[0;31m')
  GREEN=$(tput setaf 2 2>/dev/null  || printf '\033[0;32m')
  YELLOW=$(tput setaf 3 2>/dev/null || printf '\033[1;33m')
  BLUE=$(tput setaf 4 2>/dev/null   || printf '\033[0;34m')
  CYAN=$(tput setaf 6 2>/dev/null   || printf '\033[0;36m')
  BOLD=$(tput bold 2>/dev/null      || printf '\033[1m')
  DIM=$(tput dim 2>/dev/null        || printf '\033[2m')
  NC=$(tput sgr0 2>/dev/null        || printf '\033[0m')
  # Unicode icons when we have a capable terminal
  ICON_OK="✓"   ICON_FAIL="✗"  ICON_WARN="⚠"
  ICON_INFO="ℹ" ICON_SKIP="→"  ICON_STEP="◆"
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' NC=''
  # ASCII fallbacks for CI / piped output
  ICON_OK="[OK]" ICON_FAIL="[FAIL]" ICON_WARN="[WARN]"
  ICON_INFO="[INFO]" ICON_SKIP="[SKIP]" ICON_STEP="---"
fi

# ── Timestamp ─────────────────────────────────────────────────────────────────
_ts() { date '+%H:%M:%S'; }

# ── Log helpers — all write to stderr ────────────────────────────────────────
log_info()  { [[ "${QUIET}" == "1" ]] && return 0; printf "%s ${BLUE}%s${NC}  %s\n"            "$(_ts)" "${ICON_INFO}" "$*" >&2; }
log_ok()    { [[ "${QUIET}" == "1" ]] && return 0; printf "%s ${GREEN}%s${NC}  %s\n"            "$(_ts)" "${ICON_OK}"   "$*" >&2; }
log_warn()  {                                       printf "%s ${YELLOW}%s${NC} %s\n"            "$(_ts)" "${ICON_WARN}" "$*" >&2; }
log_error() {                                       printf "%s ${RED}%s${NC}  %s\n"              "$(_ts)" "${ICON_FAIL}" "$*" >&2; }
log_skip()  { [[ "${QUIET}" == "1" ]] && return 0; printf "%s ${DIM}%s  %s${NC}\n"              "$(_ts)" "${ICON_SKIP}" "$*" >&2; }
log_step()  { [[ "${QUIET}" == "1" ]] && return 0; printf "%s ${CYAN}%s${NC}  ${BOLD}%s${NC}\n" "$(_ts)" "${ICON_STEP}" "$*" >&2; }

# ── Print helpers — human-friendly UI output (no timestamps) ─────────────────
# Use these for setup scripts and interactive flows where clean visual hierarchy
# matters more than parseable event logs. All write to stderr.
print_header()  { [[ "${QUIET}" == "1" ]] && return 0; printf "\n${BOLD}${BLUE}══ %s ══${NC}\n\n" "$*" >&2; }
print_info()    { [[ "${QUIET}" == "1" ]] && return 0; printf "${BLUE}%s${NC}  %s\n"  "${ICON_INFO}" "$*" >&2; }
print_success() { [[ "${QUIET}" == "1" ]] && return 0; printf "${GREEN}%s${NC}  %s\n" "${ICON_OK}"   "$*" >&2; }
print_warning() {                                       printf "${YELLOW}%s${NC} %s\n" "${ICON_WARN}" "$*" >&2; }
print_error()   {                                       printf "${RED}%s${NC}  %s\n"   "${ICON_FAIL}" "$*" >&2; }

# ── Step framework ────────────────────────────────────────────────────────────
# Caller sets STEP_TOTAL before the first step_start call.
STEP_TOTAL="${STEP_TOTAL:-0}"
STEP_CURRENT=0
STEPS_RUN=0
STEPS_SKIPPED=0
STEP_NAME=""
_STEP_T0=0

step_start() {
  STEP_CURRENT=$(( STEP_CURRENT + 1 ))
  STEP_NAME="$1"
  _STEP_T0=$(date +%s)
  log_step "[${STEP_CURRENT}/${STEP_TOTAL}] ${STEP_NAME}"
}

step_done() {
  local elapsed=$(( $(date +%s) - _STEP_T0 ))
  STEPS_RUN=$(( STEPS_RUN + 1 ))
  log_ok "[${STEP_CURRENT}/${STEP_TOTAL}] ${STEP_NAME} (${elapsed}s)"
}

step_skip() {
  STEPS_SKIPPED=$(( STEPS_SKIPPED + 1 ))
  log_skip "[${STEP_CURRENT}/${STEP_TOTAL}] ${STEP_NAME} — already done, skipping"
}

# ── Noise suppression: spinner + per-step log ─────────────────────────────────
# run_quietly LOG_FILE CMD [ARGS...]
#   • Routes CMD stdout+stderr to LOG_FILE
#   • Shows a spinner while running (TTY only; not in CI)
#   • On failure: dumps last 50 lines inline so the cause is immediately visible
#   • In --verbose mode: streams output live instead
run_quietly() {
  local log_file="$1"; shift

  if [[ "${VERBOSE:-0}" == "1" ]]; then
    "$@"
    return
  fi

  "$@" >"${log_file}" 2>&1 &
  local pid=$!

  # Spinner — only when stderr is a tty and not in CI
  if [[ -t 2 ]] && [[ "${CI:-}" != "true" ]]; then
    local i=0
    while kill -0 "${pid}" 2>/dev/null; do
      printf "\r   %s" "${i%4}|/-\\" >&2   # fallback char cycle
      case $(( i % 4 )) in
        0) printf "\r   |" >&2 ;;
        1) printf "\r   /" >&2 ;;
        2) printf "\r   -" >&2 ;;
        3) printf "\r   \\" >&2 ;;
      esac
      i=$(( i + 1 ))
      sleep 0.1
    done
    printf "\r\033[K" >&2   # erase spinner line
  fi

  local rc=0
  # || rc=$? prevents set -e from aborting here; caller decides what to do
  wait "${pid}" || rc=$?

  if [[ ${rc} -ne 0 ]]; then
    log_error "Command failed (exit ${rc}). Last output:"
    tail -n 50 "${log_file}" | sed 's/^/    /' >&2
    log_error "Full log: ${log_file}"
  fi

  return ${rc}
}

# ── Final summary ─────────────────────────────────────────────────────────────
# print_summary SCRIPT_START_EPOCH [LOG_DIR]
print_summary() {
  local start="${1}"
  local log_dir="${2:-}"
  local elapsed=$(( $(date +%s) - start ))
  local mins=$(( elapsed / 60 ))
  local secs=$(( elapsed % 60 ))

  printf "\n" >&2
  printf "%s\n" "${BOLD}${GREEN}══════════════════════════════════════════${NC}" >&2
  printf "  Steps run:     %s\n"  "${STEPS_RUN}"                               >&2
  printf "  Steps skipped: %s\n"  "${STEPS_SKIPPED}"                           >&2
  printf "  Total time:    %dm %ds\n" "${mins}" "${secs}"                       >&2
  [[ -n "${log_dir}" ]] && printf "  Step logs:     %s\n" "${log_dir}"         >&2
  printf "%s\n" "${BOLD}${GREEN}══════════════════════════════════════════${NC}" >&2
}
