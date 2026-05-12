import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { validateCuid } from '@/lib/validation';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/jobs/[id]' });

/**
 * Phase-aware stuck detection thresholds.
 * Scraping and recommendation phases take significantly longer per page
 * (30-40s each) than syncing or collecting, so they need higher thresholds.
 */
function getStuckThreshold(phase: string | null): number {
  switch (phase) {
    case 'SCRAPING':
    case 'GENERATING_RECS':
      return 5 * 60 * 1000; // 5 minutes — these phases take 30-40s per page
    case 'FILLING_MISSING':
      return 3 * 60 * 1000; // 3 minutes — backfill queries can be numerous
    case 'COLLECTING':
      return 2 * 60 * 1000; // 2 minutes — GA4 + NetDonor per page
    default:
      return 60 * 1000; // 1 minute — SYNCING, FINALIZING
  }
}

/**
 * GET /api/jobs/[id]
 *
 * Get job status for polling
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invalidId = validateCuid(id);
    if (invalidId) return invalidId;

    const job = await prisma.collectionJob.findUnique({
      where: { id },
    });

    if (!job) {
      logger.warn({ jobId: id }, 'Job not found for polling');
      return NextResponse.json(
        { error: 'Job not found', message: `Job with ID ${id} not found`, statusCode: 404 },
        { status: 404 }
      );
    }

    const canRetry = job.status === 'FAILED' && job.errors.length < 3;

    // Calculate time since last update for debugging
    // Use phase-aware thresholds: scraping/generating phases take longer per page
    const timeSinceUpdate = Date.now() - new Date(job.updatedAt).getTime();
    const stuckThresholdMs = getStuckThreshold(job.phase);
    const isStuck = job.status === 'PROCESSING' && timeSinceUpdate > stuckThresholdMs;

    // Log polling status for debugging (only log every 10th poll or when stuck)
    if (isStuck || job.status === 'COMPLETED' || job.status === 'FAILED') {
      logger.info(
        { jobId: id, status: job.status, phase: job.phase, progress: job.progress, processedPages: job.processedPages, totalPages: job.totalPages, timeSinceUpdateMs: timeSinceUpdate, isStuck, errorCount: job.errors?.length || 0 },
        'Job status polled'
      );
    }

    return NextResponse.json({
      job: {
        ...job,
        startedAt: job.startedAt.toISOString(),
        completedAt: job.completedAt?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
      canRetry,
      // Include debugging info
      debug: {
        timeSinceUpdateMs: timeSinceUpdate,
        isStuck,
      },
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error polling job status');
    return handleApiError(error);
  }
}
