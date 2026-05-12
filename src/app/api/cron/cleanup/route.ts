import { NextRequest, NextResponse } from 'next/server';
import { runCleanup } from '@/lib/cleanup';
import { validateCronSecret, errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/cron/cleanup' });

/**
 * GET /api/cron/cleanup
 *
 * Data cleanup endpoint. Called by in-process scheduler weekly,
 * or manually via curl with CRON_SECRET auth.
 */
export async function GET(request: NextRequest) {
  try {
    if (!validateCronSecret(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing cron secret' },
        { status: 401 }
      );
    }

    const result = await runCleanup();

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      details: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Cleanup cron job error');
    return errorResponse(error, 'Cleanup failed');
  }
}
