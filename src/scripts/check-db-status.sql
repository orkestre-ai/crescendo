-- Quick SQL queries to check sync job status
-- Run these in Prisma Studio's SQL query tab or using psql

-- 1. Check recent jobs and their status
SELECT 
  id,
  status,
  phase,
  progress,
  "triggeredBy",
  "totalPages",
  "processedPages",
  "startedAt",
  "completedAt",
  EXTRACT(EPOCH FROM (COALESCE("completedAt", NOW()) - "startedAt")) as duration_seconds
FROM "CollectionJob"
ORDER BY "startedAt" DESC
LIMIT 10;

-- 2. Find hanging jobs (processing for > 5 minutes)
SELECT 
  id,
  status,
  phase,
  progress,
  "startedAt",
  EXTRACT(EPOCH FROM (NOW() - "startedAt")) as seconds_running,
  errors
FROM "CollectionJob"
WHERE status = 'PROCESSING'
  AND "startedAt" < NOW() - INTERVAL '5 minutes'
ORDER BY "startedAt" DESC;

-- 3. Check job errors
SELECT 
  id,
  status,
  phase,
  jsonb_array_length(errors) as error_count,
  errors
FROM "CollectionJob"
WHERE jsonb_array_length(errors) > 0
ORDER BY "startedAt" DESC
LIMIT 5;

-- 4. Count pages by status
SELECT 
  status,
  COUNT(*) as count
FROM "FundraisingPage"
GROUP BY status
ORDER BY count DESC;

-- 5. Recently synced pages
SELECT 
  "enPageId",
  name,
  status,
  "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - "updatedAt")) as seconds_since_update
FROM "FundraisingPage"
ORDER BY "updatedAt" DESC
LIMIT 20;

-- 6. Check for duplicate EN page IDs (shouldn't happen)
SELECT 
  "enPageId",
  COUNT(*) as count
FROM "FundraisingPage"
GROUP BY "enPageId"
HAVING COUNT(*) > 1;

-- 7. Job success rate (last 20 jobs)
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "CollectionJob" ORDER BY "startedAt" DESC LIMIT 20), 2) as percentage
FROM (
  SELECT status FROM "CollectionJob" ORDER BY "startedAt" DESC LIMIT 20
) as recent_jobs
GROUP BY status
ORDER BY count DESC;

-- 8. Average job duration by phase
SELECT 
  phase,
  status,
  COUNT(*) as jobs,
  ROUND(AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))), 2) as avg_duration_seconds
FROM "CollectionJob"
WHERE "completedAt" IS NOT NULL
GROUP BY phase, status
ORDER BY phase, status;

-- 9. Most recent job details (full info)
SELECT *
FROM "CollectionJob"
ORDER BY "startedAt" DESC
LIMIT 1;

-- 10. Kill a hanging job (update status to FAILED)
-- UNCOMMENT AND RUN THIS ONLY IF YOU WANT TO MANUALLY FAIL A JOB
-- UPDATE "CollectionJob"
-- SET 
--   status = 'FAILED',
--   errors = errors || jsonb_build_array(
--     jsonb_build_object(
--       'phase', phase,
--       'error', 'Manually failed - job was hanging',
--       'timestamp', NOW()
--     )
--   )
-- WHERE id = 'YOUR_JOB_ID_HERE'
-- RETURNING *;



