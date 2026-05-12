#!/usr/bin/env bash
# Unit test for setup.sh detection logic.
# Does NOT invoke setup.sh end-to-end (that would run npm install + playwright download).
# Exercises the OS detection and Node version parsing in isolation.
#
# Run from the repo root: `bash src/scripts/__tests__/setup-detection.test.sh`
# (structural assertions grep `setup.sh` relative to cwd; must be repo root).

set -e

# Track pass/fail
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

# ----- OS detection helper (mirrors setup.sh lines under "1. OS / shell detection") -----
detect_os() {
  local ostype="$1"
  case "$ostype" in
    darwin*)              echo mac ;;
    msys*|cygwin*|mingw*) echo windows ;;
    linux-gnu*|linux*)    echo linux ;;
    *)                    echo unknown ;;
  esac
}

echo "OS detection"
[ "$(detect_os 'darwin23.0')" = "mac" ] && pass "darwin23.0 -> mac" || fail "darwin23.0 -> mac"
[ "$(detect_os 'darwin22.0')" = "mac" ] && pass "darwin22.0 -> mac" || fail "darwin22.0 -> mac"
[ "$(detect_os 'msys')" = "windows" ] && pass "msys -> windows" || fail "msys -> windows"
[ "$(detect_os 'mingw64')" = "windows" ] && pass "mingw64 -> windows" || fail "mingw64 -> windows"
[ "$(detect_os 'cygwin')" = "windows" ] && pass "cygwin -> windows" || fail "cygwin -> windows"
[ "$(detect_os 'linux-gnu')" = "linux" ] && pass "linux-gnu -> linux" || fail "linux-gnu -> linux"
[ "$(detect_os 'freebsd12.0')" = "unknown" ] && pass "freebsd12.0 -> unknown" || fail "freebsd12.0 -> unknown"
[ "$(detect_os '')" = "unknown" ] && pass "empty -> unknown" || fail "empty -> unknown"

# ----- Node version parsing helper (mirrors setup.sh NODE_MAJOR extraction) -----
node_major() {
  local version="$1"
  echo "${version%%.*}"
}

echo ""
echo "Node version parsing"
[ "$(node_major '20.11.1')" = "20" ] && pass "20.11.1 -> 20" || fail "20.11.1 -> 20"
[ "$(node_major '22.10.0')" = "22" ] && pass "22.10.0 -> 22" || fail "22.10.0 -> 22"
[ "$(node_major '19.9.9')" = "19" ] && pass "19.9.9 -> 19" || fail "19.9.9 -> 19"
[ "$(node_major '20')" = "20" ] && pass "20 -> 20" || fail "20 -> 20"

# ----- Guard: empty NODE_MAJOR does not crash arithmetic (Pitfall 7) -----
safe_lt_20() {
  local major="$1"
  if [ -z "$major" ] || ! [ "$major" -ge 20 ] 2>/dev/null; then
    echo "needs-upgrade"
  else
    echo "ok"
  fi
}

echo ""
echo "Empty/invalid NODE_MAJOR guard (Pitfall 7)"
[ "$(safe_lt_20 '')" = "needs-upgrade" ] && pass "empty -> needs-upgrade" || fail "empty -> needs-upgrade"
[ "$(safe_lt_20 'abc')" = "needs-upgrade" ] && pass "non-numeric -> needs-upgrade" || fail "non-numeric -> needs-upgrade"
[ "$(safe_lt_20 '20')" = "ok" ] && pass "20 -> ok" || fail "20 -> ok"
[ "$(safe_lt_20 '19')" = "needs-upgrade" ] && pass "19 -> needs-upgrade" || fail "19 -> needs-upgrade"
[ "$(safe_lt_20 '22')" = "ok" ] && pass "22 -> ok" || fail "22 -> ok"

# ----- Setup.sh sources lib/print.sh (structural assertion, not a logic test) -----
echo ""
echo "Structural assertions on setup.sh"
grep -q 'source.*src/scripts/lib/print\.sh' setup.sh && pass "setup.sh sources lib/print.sh" || fail "setup.sh sources lib/print.sh"
grep -q '\[ ! -f \.env\.local \]' setup.sh && pass "setup.sh guards .env.local overwrite" || fail "setup.sh guards .env.local overwrite"
grep -q 'npm run doctor' setup.sh && pass "setup.sh invokes npm run doctor" || fail "setup.sh invokes npm run doctor"

# ----- Summary -----
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
