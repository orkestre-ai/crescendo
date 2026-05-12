# Debugging Guide - Sync Jobs & Data Collection

**Created**: 2025-11-26  
**Last Updated**: 2025-11-26  
**Status**: Active

Complete guide for debugging synchronization jobs, data collection issues, and Engaging Networks API problems.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Debug Endpoints](#debug-endpoints)
3. [Sync Job Workflow](#sync-job-workflow)
4. [Common Issues & Solutions](#common-issues--solutions)
5. [Troubleshooting Steps](#troubleshooting-steps)
6. [Helper Scripts](#helper-scripts)
7. [Monitoring in Production](#monitoring-in-production)

---

## Quick Start

### Your Issue

- Sync job hanging in database
- Not seeing anything return from EN API calls
- Need to trace what's happening

### Immediate Actions

1. **Test EN API Connection**:

   ```bash
   curl http://localhost:3000/api/debug/en-test | jq '.'
   ```

2. **Check Hanging Job**:

   ```bash
   npx prisma studio
   # Open CollectionJob table, find jobs with status=PROCESSING
   ```

3. **View Logs for Job**:
   ```bash
   curl "http://localhost:3000/api/debug/logs?filter=YOUR_JOB_ID" | jq '.'
   ```

---

## Debug Endpoints

### 1. Test EN API Directly

Test the Engaging Networks API without running a full sync job:

```bash
# Test with default parameters (10 pages, offset 0)
curl http://localhost:3000/api/debug/en-test

# Test with custom parameters
curl "http://localhost:3000/api/debug/en-test?limit=5&offset=0&type=nd&status=live"
```

**What to look for:**

- `success: true` - API is responding
- `pageCount` - Number of pages returned (should be > 0 if you have live pages)
- `duration` - How long the API call took
- `hasMore: true` - More pages available (returned count equals limit)

**Common issues:**

- 401 Unauthorized: Check `EN_API_TOKEN` environment variable
- Empty pages array: No live pages in EN, or wrong type/status
- Timeout: EN API is slow or unreachable

### 2. View Recent Logs

View structured logs from the job processing:

```bash
# View last 100 log lines
curl http://localhost:3000/api/debug/logs

# View last 50 lines
curl "http://localhost:3000/api/debug/logs?lines=50"

# Filter logs by keyword (e.g., "sync")
curl "http://localhost:3000/api/debug/logs?filter=sync"

# Filter by job ID
curl "http://localhost:3000/api/debug/logs?filter=clxy12345"
```

**What to look for:**

- `job.sync.started` - Sync phase began
- `job.sync.api.call` - Each API call to EN (with loop count)
- `job.sync.api.response` - Each API response (with page count)
- `job.sync.page.discovered` or `job.sync.page.updated` - Individual page processing
- `job.sync.summary` - Final results

---

## Sync Job Workflow

### Overview

The sync job flow:

1. **Job Creation**: A CollectionJob is created with phase `SYNCING`
2. **Sync Phase**: Fetches all live pages from Engaging Networks API
3. **Database Updates**: Updates/creates pages in the database
4. **Phase Transition**: Moves to `COLLECTING` phase

### Enhanced Logging

The sync process logs:

- Every API call to EN (with loop count, offset)
- Every API response (with page count, duration)
- Individual page discoveries/updates
- Summary of sync results
- Console output with emojis for easy scanning

### Safety Features

1. **Max Loop Protection**: Stops after 50 iterations (5000 pages max)
2. **Explicit Error Handling**: API errors are caught and logged
3. **Empty Response Detection**: Exits early if API returns 0 pages
4. **Timeout Protection**: 30-second timeout per API call
5. **Detailed Logging**: Every API call and response is logged

### Console Output

When running a job, you'll see detailed console output:

```
🚀 [Job clxy1234] Processing chunk...
📊 [Job clxy1234] Status: PENDING, Phase: SYNCING, Progress: 0%
▶️  [Job clxy1234] Updated to PROCESSING
🔄 [Job clxy1234] Entering SYNCING phase...
✅ [Job clxy1234] Phase complete: { done: false, progress: 10, message: '...' }
```

---

## Common Issues & Solutions

### Issue 1: Job Stuck at 0%, Phase SYNCING

**Symptom**: Job hanging in database, no progress

**Cause**: EN API call hanging or timing out

**Debug**:

```bash
curl http://localhost:3000/api/debug/en-test
```

**Solutions**:

- Check `EN_BASE_URL` and `EN_API_TOKEN` in `.env.local`
- Check EN dashboard - are there live fundraising pages?
- Check network connectivity
- Increase timeout in `engaging-networks.ts` (currently 30s)
- Check EN API status

### Issue 2: EN API Not Responding

**Symptom**: Job stuck at 0%, no logs

**Debug**: `curl http://localhost:3000/api/debug/en-test`

**Fix**: Check EN credentials and connectivity

### Issue 3: EN API Returns 0 Pages

**Symptom**: Job completes instantly, discovers 0 pages

**Cause**: No live pages, or wrong query parameters

**Debug**:

- Check EN dashboard for live pages
- Verify page type is 'nd' (NetDonor)
- Verify status is 'live'

**Solutions**:

- Adjust query parameters in the sync
- Check EN for archived/paused pages

### Issue 4: Job Shows Some Progress Then Hangs

**Cause**: Specific page causing an error

**Debug**:

```bash
curl "http://localhost:3000/api/debug/logs?filter=sync" | jq '.logs[-20:]'
```

Look for the last page that was successfully processed.

**Solutions**:

- Check if that specific page exists in EN
- Verify the page data structure
- Add error handling for that page

### Issue 5: Slow EN API

**Symptom**: Each API call takes > 10 seconds

**Debug**: Check duration in logs

**Fix**: Normal, just wait. Consider reducing `SYNC_PAGE_LIMIT`

### Issue 6: Database Lock

**Symptom**: Job hangs during page updates

**Debug**: Check database connection and locks

**Fix**: Restart database, check for other processes

### Issue 7: Infinite Loop (maxLoops Warning)

**Cause**: Safety limit hit (50 loops = 5000 pages)

**Debug**:

```bash
curl "http://localhost:3000/api/debug/logs?filter=max.loops"
```

**Solutions**:

- This is by design if you have > 5000 pages
- Increase `maxLoops` in `jobs.ts` if legitimate
- Check for duplicate pages being returned by EN

---

## Troubleshooting Steps

### Step 1: Test EN API Connection

```bash
curl http://localhost:3000/api/debug/en-test | jq '.'
```

**What you're looking for:**

- `"success": true` ✅ API is working
- `"pageCount": 10` (or > 0) ✅ Pages are being returned
- `"duration": "1234ms"` ✅ Response time is reasonable

**If it fails:**

- Check `EN_BASE_URL` and `EN_API_TOKEN` in `.env.local`
- Check EN dashboard - are there live fundraising pages?
- Check network connectivity

### Step 2: Check Your Hanging Job

Open Prisma Studio:

```bash
npx prisma studio
```

Go to `CollectionJob` table:

- Find jobs with status = `PROCESSING`
- Note the job ID
- Check how long it's been running
- Check current phase and progress

### Step 3: View Logs for That Job

```bash
# Replace JOB_ID with your actual job ID (e.g., clxy12345)
curl "http://localhost:3000/api/debug/logs?filter=JOB_ID" | jq '.'
```

**What to look for:**

- `job.sync.started` - Did it start?
- `job.sync.api.call` - Which loop was it on?
- `job.sync.api.response` - How many pages came back?
- Any error messages?

### Step 4: Check Console Output

If running locally (`npm run dev`), check your terminal:

- Look for 🚀 🔄 ✅ ❌ emojis
- Each API call is now logged
- Errors show with full stack traces

### Step 5: Manually Trigger a Small Sync Test

If needed, you can test the sync with a smaller batch:

1. Open `src/config/constants.ts`
2. Temporarily change `SYNC_PAGE_LIMIT` from 100 to 5
3. Restart your server
4. Trigger a new sync job

This will help identify if:

- The API works but is slow
- There's an issue with pagination
- A specific page is causing problems

---

## Helper Scripts

### Check Sync Status

```bash
./src/scripts/check-sync-status.sh

# Or check a specific job:
./src/scripts/check-sync-status.sh YOUR_JOB_ID
```

This script:

- Lists all active jobs
- Shows job status and progress
- Displays recent errors
- Provides job details

---

## Monitoring in Production

### View Logs in Vercel

```bash
# View real-time logs
vercel logs --follow

# View logs for specific deployment
vercel logs [deployment-url]
```

### Filter for Sync Issues

```bash
vercel logs | grep "sync"
vercel logs | grep "ERROR"
```

### Check Job Status via API

```bash
# Get job status
curl https://your-app.vercel.app/api/jobs/[jobId]

# List recent jobs
curl https://your-app.vercel.app/api/jobs
```

---

## Environment Variables to Check

Ensure these are set correctly:

```bash
EN_BASE_URL=https://your-org.engagingnetworks.app/ens/service
EN_API_TOKEN=your_api_token_here
```

Test them:

```bash
# Print (don't commit this!)
echo $EN_BASE_URL
echo $EN_API_TOKEN
```

---

## Performance Metrics

Expected timings:

- EN API call (100 pages): 1-3 seconds
- Full sync (100 pages): 10-30 seconds
- Full sync (1000 pages): 1-3 minutes

If timings are much slower:

- Check EN API performance
- Check database performance
- Consider reducing `SYNC_PAGE_LIMIT`

---

## What's Changed in the Code

### `/src/lib/jobs.ts`

- Added detailed console.log statements with emojis
- Added loop counter and max loop protection
- Added try-catch around EN API calls
- Added timing for each API call
- Added summary logging

### `/src/lib/engaging-networks.ts`

- Already had good error handling
- Has 30-second timeout
- Has automatic retry on rate limits
- Has request/response logging via ApiLogger

---

## Code References

- Sync logic: `src/lib/jobs.ts` (line 130-285)
- EN client: `src/lib/engaging-networks.ts`
- Constants: `src/config/constants.ts`
- Debug endpoints:
  - `src/app/api/debug/en-test/route.ts`
  - `src/app/api/debug/logs/route.ts`

---

## Next Steps

If you're still stuck after following this guide:

1. **Capture a full trace**: Run a sync with all logs captured
2. **Check the EN API response**: Use the debug endpoint to see raw data
3. **Share logs**: Export relevant logs for review
4. **Test with minimal data**: Temporarily filter to just 1-2 pages

### What to Share if Still Stuck

If you're still having issues, share:

1. Output of `curl http://localhost:3000/api/debug/en-test`
2. Screenshot of hanging job in Prisma Studio
3. Output of `curl "http://localhost:3000/api/debug/logs?filter=sync&lines=50"`
4. Any console errors from your terminal

---

## Related Documentation

- [Engaging Networks API Reference](../api/engaging-networks.md) - EN API documentation
- [Logging Guide](../architecture/logging.md) - Logging system documentation
- [Data Flow Architecture](../architecture/data-flow.md) - How sync jobs work
