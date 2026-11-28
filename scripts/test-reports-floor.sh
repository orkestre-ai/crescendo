#!/usr/bin/env bash
# Runs the report tests and fails unless at least MIN_PASSING of them passed.
# A deleted or skipped test file would otherwise pass quietly: tsx --test
# exits 0 when it is given nothing to run.
set -euo pipefail

MIN_PASSING=40

output=$(npm run test:reports 2>&1 | tee /dev/stderr)

# The summary line is "# pass N" (TAP, when piped) or "ℹ pass N" (terminal).
passing=$(printf '%s\n' "$output" | sed -nE 's/^(#|ℹ) pass ([0-9]+)$/\2/p' | tail -1)

if [ -z "$passing" ]; then
  echo "test-reports-floor: no pass count found in the test output" >&2
  exit 1
fi

if [ "$passing" -lt "$MIN_PASSING" ]; then
  echo "test-reports-floor: only $passing report tests passed; at least $MIN_PASSING are required" >&2
  exit 1
fi

echo "test-reports-floor: $passing report tests passed (floor: $MIN_PASSING)"
