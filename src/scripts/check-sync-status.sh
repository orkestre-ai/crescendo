#!/bin/bash

# Quick script to check sync job status and debug issues
# Usage: ./scripts/check-sync-status.sh [job-id]

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
JOB_ID="${1:-}"

echo "🔍 Crescendo - Sync Status Checker"
echo "======================================"
echo ""

# Test EN API
echo "1️⃣  Testing EN API Connection..."
EN_TEST=$(curl -s "${BASE_URL}/api/debug/en-test?limit=5")
if echo "$EN_TEST" | jq -e '.success' > /dev/null 2>&1; then
  PAGE_COUNT=$(echo "$EN_TEST" | jq -r '.response.pageCount')
  DURATION=$(echo "$EN_TEST" | jq -r '.duration')
  echo "   ✅ EN API working: $PAGE_COUNT pages returned in $DURATION"
else
  echo "   ❌ EN API failed:"
  echo "$EN_TEST" | jq '.'
  exit 1
fi
echo ""

# Check recent jobs
echo "2️⃣  Checking Recent Jobs..."
JOBS=$(curl -s "${BASE_URL}/api/jobs?limit=5")
echo "$JOBS" | jq -r '.jobs[] | "   [\(.status)] \(.id[0:8])... - Phase: \(.phase), Progress: \(.progress)%, Started: \(.startedAt)"'
echo ""

# Check specific job if provided
if [ -n "$JOB_ID" ]; then
  echo "3️⃣  Checking Job: $JOB_ID"
  JOB=$(curl -s "${BASE_URL}/api/jobs/${JOB_ID}")
  echo "$JOB" | jq '.'
  echo ""
  
  echo "4️⃣  Recent Logs for Job: $JOB_ID"
  LOGS=$(curl -s "${BASE_URL}/api/debug/logs?filter=${JOB_ID}&lines=20")
  echo "$LOGS" | jq -r '.logs[] | "\(.timestamp) [\(.level)] \(.code): \(.message)"'
else
  echo "3️⃣  Recent Sync Logs..."
  LOGS=$(curl -s "${BASE_URL}/api/debug/logs?filter=sync&lines=30")
  if echo "$LOGS" | jq -e '.success' > /dev/null 2>&1; then
    TOTAL_LINES=$(echo "$LOGS" | jq -r '.totalLines')
    RETURNED=$(echo "$LOGS" | jq -r '.returnedLines')
    echo "   Found $RETURNED sync-related logs (out of $TOTAL_LINES total)"
    echo ""
    echo "   Recent sync events:"
    echo "$LOGS" | jq -r '.logs[-10:][] | "   \(.timestamp // "N/A") [\(.level // "INFO")] \(.code // "unknown"): \(.message // .raw)"' 2>/dev/null || echo "   (No structured logs found)"
  else
    echo "   ⚠️  No log file found yet"
  fi
fi

echo ""
echo "✅ Status check complete!"
echo ""
echo "Useful commands:"
echo "  - Test EN API:        curl ${BASE_URL}/api/debug/en-test | jq '.'"
echo "  - View logs:          curl ${BASE_URL}/api/debug/logs | jq '.'"
echo "  - Check specific job: ./scripts/check-sync-status.sh YOUR_JOB_ID"
echo "  - View all jobs:      curl ${BASE_URL}/api/jobs | jq '.'"



