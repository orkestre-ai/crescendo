import { NextRequest, NextResponse } from 'next/server';
import { jobProcessor } from '@/lib/jobs';
import { handleApiError, validateCronSecret } from '@/lib/api-helpers';
import { shouldRunScheduledRefresh } from '@/lib/settings';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/cron/daily-collection' });

/**
 * GET /api/cron/daily-collection
 *
 * Scheduled collection endpoint. Called by in-process scheduler hourly,
 * or manually via curl with CRON_SECRET auth.
 *
 * Respects the refreshSchedule setting from AppSettings —
 * HOURLY runs every invocation, DAILY/WEEKLY only when enough time has elapsed.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret using shared helper (matches cleanup route pattern)
    if (!validateCronSecret(request)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or missing cron secret',
          statusCode: 401,
        },
        { status: 401 }
      );
    }

    // Check if refresh should run based on schedule settings
    const shouldRefresh = await shouldRunScheduledRefresh();

    if (!shouldRefresh) {
      return NextResponse.json({
        status: 'skipped',
        message: 'Refresh skipped based on schedule settings',
      });
    }

    // Create and start the job
    const job = await jobProcessor.createCollectionJob('cron', 'SYNC');

    // Process to completion asynchronously
    jobProcessor.processJobToCompletion(job.id).catch((error) => {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Cron job processing error');
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'triggered',
      message: 'Collection job created successfully',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
