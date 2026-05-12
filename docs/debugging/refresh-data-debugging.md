# Refresh Data Debugging Guide

**Created**: 2025-12-01
**Last Updated**: 2025-12-05

A comprehensive guide for debugging the "Refresh Data" function when jobs hang, fail, or behave unexpectedly.

---

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [Understanding the Job Flow](#understanding-the-job-flow)
3. [Common Issues and Solutions](#common-issues-and-solutions)
4. [Debugging Tools](#debugging-tools)
5. [API Endpoints](#api-endpoints)
6. [Test Script Usage](#test-script-usage)
7. [Logs and Monitoring](#logs-and-monitoring)

---

## Quick Diagnosis

### Is the job stuck?

```bash
# Check job health status
curl http://localhost:3000/api/jobs/health

# Get detailed debug info for a specific job
curl http://localhost:3000/api/jobs/{JOB_ID}/debug
```

### How to fix a stuck job:

```bash
# Continue processing a stuck job
curl -X POST http://localhost:3000/api/jobs/{JOB_ID}/continue
```

### Using the test script:

```bash
# Run health check
npx tsx src/scripts/test-refresh-debug.ts --health

# Monitor a specific job
npx tsx src/scripts/test-refresh-debug.ts --job-id=cm...

# Continue a stuck job
npx tsx src/scripts/test-refresh-debug.ts --continue --job-id=cm...

# Create and monitor a new test job
npx tsx src/scripts/test-refresh-debug.ts
```

---

## Understanding the Job Flow

### Job Processing Flow

```
User clicks "Refresh Data"
    ↓
POST /api/jobs (creates job, starts async processing)
    ↓
processJobToCompletion() - continues until done or timeout
    ↓
┌─────────────────────────────────────────────────────┐
│ Phase 1: SYNCING (0-10%)                            │
│   - Fetches pages from Engaging Networks API        │
│   - Creates/updates FundraisingPage records         │
│   - Marks missing pages as PAUSED                   │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ Phase 2: SCRAPING (10-30%)                          │
│   - Scrapes page content (HTML)                     │
│   - Extracts headlines, CTAs, donation amounts      │
│   - Processed in chunks of 10 pages                 │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ Phase 3: COLLECTING (30-50%)                        │
│   - Fetches GA4 metrics for each page               │
│   - Creates PerformanceSnapshot records             │
│   - Backfills 90 days for new pages                 │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ Phase 4: GENERATING_RECS (50-90%)                   │
│   - Generates AI recommendations via Claude         │
│   - Creates OptimizationRecommendation records      │
│   - Processed in batches of 5 pages                 │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ Phase 5: FINALIZING (90-100%)                       │
│   - Marks job as COMPLETED or COMPLETED_WITH_ERRORS │
│   - Sets completedAt timestamp                      │
└─────────────────────────────────────────────────────┘
```

### Job Status Values

| Status                  | Description                        |
| ----------------------- | ---------------------------------- |
| `PENDING`               | Job created, not yet started       |
| `PROCESSING`            | Job is actively running            |
| `COMPLETED`             | Job finished successfully          |
| `COMPLETED_WITH_ERRORS` | Job finished with some page errors |
| `FAILED`                | Job encountered a fatal error      |
| `CANCELLED`             | Job was manually cancelled         |

### Continuation Mechanism

Jobs are processed using `processJobToCompletion()` which:

1. Calls `processJobChunk()` in a loop
2. Continues until job is done or timeout (50 seconds)
3. Returns early if max iterations reached (100)
4. Handles errors gracefully and logs them

If a job gets stuck (no updates for > 60 seconds), the frontend will:

1. Detect the stuck state
2. Automatically attempt to continue (up to 3 times)
3. Show a warning to the user

---

## Common Issues and Solutions

### Issue: Job Stuck in PROCESSING State

**Symptoms:**

- Job status stays at PROCESSING
- Progress doesn't increase
- No updates to `updatedAt` timestamp

**Diagnosis:**

```bash
curl http://localhost:3000/api/jobs/{JOB_ID}/debug
```

Look for:

- `health.isStuck: true`
- `timing.timeSinceUpdateMs` > 60000
- `health.diagnosis` for specific issues

**Solutions:**

1. **Trigger continuation:**

   ```bash
   curl -X POST http://localhost:3000/api/jobs/{JOB_ID}/continue
   ```

2. **Check for API failures:**
   - Review logs for EN API errors
   - Check GA4 API quotas
   - Verify Claude API key is valid

3. **Restart the process:**
   - Create a new job if continuation fails repeatedly

### Issue: Job Fails During Specific Phase

**Symptoms:**

- Job status is FAILED
- Errors array contains phase-specific errors

**Diagnosis:**

```bash
# Get debug info
curl http://localhost:3000/api/jobs/{JOB_ID}/debug | jq '.errors'
```

**Phase-specific solutions:**

| Phase           | Common Causes                      | Solutions                                            |
| --------------- | ---------------------------------- | ---------------------------------------------------- |
| SYNCING         | EN API auth failure, rate limiting | Check EN_API_TOKEN, wait and retry                   |
| SCRAPING        | Page timeout, invalid URLs         | Increase timeout in settings, check page status      |
| COLLECTING      | GA4 quota exceeded, auth failure   | Check GA4 credentials, wait for quota reset          |
| COLLECTING      | NetDonor fetch failed              | Check EN_PUBLIC_TOKEN, verify campaign IDs           |
| GENERATING_RECS | Claude API error, no data          | Check Anthropic API key, ensure pages have snapshots |

### Issue: Progress Stuck at 0%

**Symptoms:**

- Job in PROCESSING status
- Progress remains at 0
- SYNCING phase never completes

**Possible causes:**

1. EN API authentication failed
2. No pages returned from EN
3. Database connection issues

**Solutions:**

1. Check EN API token:

   ```bash
   # Test EN connection from settings page
   curl -X POST http://localhost:3000/api/settings/test-en
   ```

2. Check logs for authentication errors:
   ```bash
   grep "EN API" logs/dev-logs.json | tail -20
   ```

### Issue: NetDonor Fundraising Data Not Appearing

**Symptoms:**

- Job completes successfully
- GA4 data appears but no fundraising totals
- Fundraising section shows "No data available"

**Diagnosis:**

1. Check if EN_PUBLIC_TOKEN is configured:

   ```bash
   # Should return a token value
   echo $EN_PUBLIC_TOKEN
   ```

2. Check if page has a campaign ID:

   ```bash
   # Look for campaignId in page data
   curl http://localhost:3000/api/pages/{PAGE_ID} | jq '.campaignId'
   ```

3. Test NetDonor API directly:
   ```bash
   npx tsx src/scripts/test-netdonor.ts --campaign {CAMPAIGN_ID}
   ```

**Solutions:**

| Cause                     | Solution                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| Missing EN_PUBLIC_TOKEN   | Add token to `.env.local` from EN Dashboard → Account Settings → Tokens   |
| Page has no campaign ID   | Campaign ID comes from EN API sync - page may not be linked to a campaign |
| Campaign has no donations | Normal - NetDonor returns empty for campaigns with no transactions        |
| Invalid token             | Regenerate token in EN Dashboard                                          |

**Manual Fetch Test:**

```bash
# Trigger manual fetch for a single page
curl http://localhost:3000/api/pages/{PAGE_ID}/fundraising
```

**Note**: NetDonor failures are non-blocking - they don't stop the job or cause errors. Check logs for `page.netdonor.*` events.

---

### Issue: Job Completes But No Data Updated

**Symptoms:**

- Job shows COMPLETED
- Pages still show old data
- No new snapshots or recommendations

**Diagnosis:**

1. Check if phases were skipped (settings disabled)
2. Verify pages exist in database
3. Check for page-level errors

```bash
# Check phase settings
curl http://localhost:3000/api/settings | jq '.refresh'

# Check page count
curl http://localhost:3000/api/pages?limit=5
```

---

## Debugging Tools

### 1. Debug Endpoint

**Endpoint:** `GET /api/jobs/{id}/debug`

Returns comprehensive debugging information:

```json
{
  "job": {
    "id": "...",
    "status": "PROCESSING",
    "phase": "COLLECTING",
    "progress": 35,
    "processedPages": 12,
    "totalPages": 50
  },
  "timing": {
    "timeSinceUpdateMs": 45000,
    "estimatedTimeRemainingMs": 120000,
    "formattedDuration": "2.5m"
  },
  "chunks": {
    "chunkSize": 10,
    "expectedChunks": 5,
    "currentChunk": 2
  },
  "health": {
    "isStuck": false,
    "diagnosis": ["✅ Job appears healthy"],
    "nextExpectedAction": "Process more pages in COLLECTING phase"
  },
  "recovery": {
    "canRetry": false,
    "canContinue": false,
    "suggestedAction": "No action needed"
  }
}
```

### 2. Health Check Endpoint

**Endpoint:** `GET /api/jobs/health`

Returns system-wide job health:

```json
{
  "status": "healthy",
  "issues": [],
  "statistics": {
    "current": {
      "pending": 0,
      "processing": 1,
      "stuck": 0
    },
    "last24Hours": {
      "completed": 5,
      "failed": 1
    }
  },
  "jobs": {
    "stuck": [],
    "active": [...]
  },
  "recoveryActions": {
    "stuckJobs": [],
    "failedJobs": []
  }
}
```

### 3. Continue Endpoint

**Endpoint:** `POST /api/jobs/{id}/continue`

Manually triggers continuation of a stuck job:

```bash
curl -X POST http://localhost:3000/api/jobs/{JOB_ID}/continue
```

---

## API Endpoints

| Endpoint                      | Method | Description                         |
| ----------------------------- | ------ | ----------------------------------- |
| `/api/jobs`                   | POST   | Create new collection job           |
| `/api/jobs`                   | GET    | List recent jobs                    |
| `/api/jobs/{id}`              | GET    | Get job status (for polling)        |
| `/api/jobs/{id}/debug`        | GET    | Get detailed debug info             |
| `/api/jobs/{id}/continue`     | POST   | Continue stuck job                  |
| `/api/jobs/{id}/process`      | POST   | Process single chunk                |
| `/api/jobs/health`            | GET    | System health check                 |
| `/api/pages/{id}/fundraising` | GET    | Fetch NetDonor data for single page |

---

## Test Script Usage

The test script (`src/scripts/test-refresh-debug.ts`) provides command-line debugging capabilities.

### Run Health Check

```bash
npx tsx src/scripts/test-refresh-debug.ts --health
```

Output:

```
🏥 Running Health Check...

============================================================
Active Jobs: 1
============================================================

Job: cm49xyz...
  Status: PROCESSING ⚠️ STUCK
  Phase: COLLECTING
  Progress: 35%
  Pages: 12/50
  Last Update: 125s ago
  Errors: 0

  💡 To continue: POST /api/jobs/cm49xyz.../continue
```

### Create and Monitor New Job

```bash
npx tsx src/scripts/test-refresh-debug.ts
```

Output:

```
🚀 Creating new collection job...

✅ Job created: cm49abc...
   Total pages: 50
   Initial phase: SYNCING

📡 Starting job processing...

[14:32:15.123] PROCESSING   | Phase: SYNCING          | Progress:   5% | Pages: 0/50 | Errors: 0
[14:32:17.456] PROCESSING   | Phase: SCRAPING         | Progress:  15% | Pages: 5/50 | Errors: 0
[14:32:22.789] PROCESSING   | Phase: COLLECTING       | Progress:  35% | Pages: 15/50 | Errors: 0
...
[14:35:45.123] COMPLETED    | Phase: FINALIZING       | Progress: 100% | Pages: 50/50 | Errors: 2

✅ Job finished with status: COMPLETED_WITH_ERRORS
   Total time: 210s
   Iterations: 105

⚠️ Errors (2):
   1. [SCRAPING] Timeout fetching page content
   2. [COLLECTING] GA4 returned no data for page
```

### Monitor Existing Job

```bash
npx tsx src/scripts/test-refresh-debug.ts --job-id=cm49xyz123
```

### Continue Stuck Job

```bash
npx tsx src/scripts/test-refresh-debug.ts --continue --job-id=cm49xyz123
```

---

## Logs and Monitoring

### Log Locations

- **Development:** `logs/dev-logs.json`
- **Production:** `logs/production-logs.json`

### Key Log Events

| Event Code                          | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `job.create`                        | New job created                          |
| `job.chunk.start`                   | Chunk processing started                 |
| `job.chunk.complete`                | Chunk processing completed               |
| `job.phase.entering`                | Entering new phase                       |
| `job.phase.complete`                | Phase completed                          |
| `job.continuation.needed`           | Job requires more chunks                 |
| `job.process.timeout`               | Processing yielded due to timeout        |
| `job.process.complete`              | Job processing finished                  |
| `page.netdonor.collected`           | NetDonor data fetched successfully       |
| `page.netdonor.skipped.no_token`    | Skipped - EN_PUBLIC_TOKEN not configured |
| `page.netdonor.skipped.no_campaign` | Skipped - page has no campaign ID        |
| `page.netdonor.empty`               | NetDonor returned no data for campaign   |
| `page.netdonor.failed`              | NetDonor fetch failed (with error)       |

### Searching Logs

```bash
# Find all job-related logs
grep "job\." logs/dev-logs.json | tail -50

# Find errors
grep "error" logs/dev-logs.json | grep "job" | tail -20

# Find stuck job indicators
grep "continuation.needed" logs/dev-logs.json | tail -10

# Follow logs in real-time
tail -f logs/dev-logs.json | grep "job\."

# Find NetDonor-specific logs
grep "netdonor" logs/dev-logs.json | tail -20

# Find NetDonor failures
grep "netdonor.failed" logs/dev-logs.json | tail -10
```

### Log Format

```json
{
  "timestamp": "2025-12-01T14:32:15.123Z",
  "level": "info",
  "code": "job.chunk.complete",
  "message": "Chunk processing complete",
  "context": {
    "jobId": "cm49xyz...",
    "phase": "COLLECTING",
    "done": false,
    "progress": 35,
    "chunkDuration": 5230
  }
}
```

---

## Troubleshooting Checklist

When a job hangs or fails:

- [ ] Check job health: `GET /api/jobs/health`
- [ ] Get debug info: `GET /api/jobs/{id}/debug`
- [ ] Review recent logs for errors
- [ ] Verify API credentials (EN REST API, EN Public API, GA4, Claude)
- [ ] Check API rate limits and quotas
- [ ] Verify database connectivity
- [ ] Try continuing the job: `POST /api/jobs/{id}/continue`
- [ ] If all else fails, create a new job

When NetDonor data is missing:

- [ ] Verify EN_PUBLIC_TOKEN is configured
- [ ] Check page has a campaign ID (from EN sync)
- [ ] Test NetDonor API: `npx tsx src/scripts/test-netdonor.ts --campaign {ID}`
- [ ] Check logs for `page.netdonor.*` events
- [ ] Try manual fetch: `GET /api/pages/{id}/fundraising`

---

## Related Documentation

- [Data Flow Overview](../architecture/data-flow.md)
- [Service Interfaces](../architecture/refresh-data-services.md)
- [API Contracts](../architecture/refresh-data-api-contracts.md)
- [Logging Architecture](../architecture/logging.md)
