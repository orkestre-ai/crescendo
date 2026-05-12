import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/jobs/[id]/debug' });

/**
 * GET /api/jobs/[id]/debug
 *
 * Get comprehensive debugging information about a job's state.
 * Use this endpoint to diagnose job hangs and failures.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    logger.info({ jobId: id }, 'Debug info requested for job');

    const job = await prisma.collectionJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found', message: `Job with ID ${id} not found` },
        { status: 404 }
      );
    }

    // Calculate timing information
    const now = Date.now();
    const createdAt = new Date(job.createdAt).getTime();
    const updatedAt = new Date(job.updatedAt).getTime();
    const startedAt = new Date(job.startedAt).getTime();
    const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : null;

    const timeSinceCreation = now - createdAt;
    const timeSinceUpdate = now - updatedAt;
    const timeSinceStart = now - startedAt;
    const totalDuration = completedAt ? completedAt - startedAt : timeSinceStart;

    // Determine if job is stuck
    const isStuck = job.status === 'PROCESSING' && timeSinceUpdate > 60000; // 1 minute
    const isLongRunning = job.status === 'PROCESSING' && timeSinceStart > 300000; // 5 minutes

    // Analyze errors
    const errors = (job.errors as any[]) || [];
    const errorsByPhase = errors.reduce((acc: Record<string, number>, error: any) => {
      const phase = error.phase || 'unknown';
      acc[phase] = (acc[phase] || 0) + 1;
      return acc;
    }, {});

    // Get phase progress details
    const phaseProgressMap: Record<string, { start: number; end: number }> = {
      SYNCING: { start: 0, end: 10 },
      SCRAPING: { start: 10, end: 30 },
      COLLECTING: { start: 30, end: 50 },
      GENERATING_RECS: { start: 50, end: 90 },
      FINALIZING: { start: 90, end: 100 },
    };

    const currentPhaseProgress = phaseProgressMap[job.phase] || { start: 0, end: 100 };
    const phaseProgressPercentage =
      job.totalPages > 0 ? (job.processedPages / job.totalPages) * 100 : 0;

    // Estimate time remaining
    let estimatedTimeRemainingMs: number | null = null;
    if (job.status === 'PROCESSING' && job.processedPages > 0) {
      const timePerPage = totalDuration / job.processedPages;
      const remainingPages = job.totalPages - job.processedPages;
      estimatedTimeRemainingMs = timePerPage * remainingPages;
    }

    // Determine next expected action
    let nextExpectedAction = 'Unknown';
    if (job.status === 'COMPLETED' || job.status === 'COMPLETED_WITH_ERRORS') {
      nextExpectedAction = 'Job finished - no action needed';
    } else if (job.status === 'FAILED') {
      nextExpectedAction = 'Job failed - review errors and retry if needed';
    } else if (job.status === 'PENDING') {
      nextExpectedAction = 'Waiting to start processing';
    } else if (job.status === 'PROCESSING') {
      if (isStuck) {
        nextExpectedAction = 'Job appears stuck - may need manual intervention';
      } else if (job.processedPages < job.totalPages) {
        nextExpectedAction = `Process more pages in ${job.phase} phase (${job.processedPages}/${job.totalPages})`;
      } else {
        nextExpectedAction = `Transition to next phase after ${job.phase}`;
      }
    }

    // Build diagnosis
    const diagnosis: string[] = [];
    if (isStuck) {
      diagnosis.push(
        `⚠️ Job appears stuck - no updates for ${Math.round(timeSinceUpdate / 1000)}s`
      );
    }
    if (isLongRunning) {
      diagnosis.push(`⚠️ Job has been running for ${Math.round(timeSinceStart / 60000)} minutes`);
    }
    if (errors.length > 0) {
      diagnosis.push(`⚠️ Job has ${errors.length} error(s)`);
    }
    if (job.status === 'PROCESSING' && job.processedPages === 0 && job.phase !== 'SYNCING') {
      diagnosis.push(`⚠️ Job in ${job.phase} phase but no pages processed yet`);
    }
    if (diagnosis.length === 0) {
      if (job.status === 'COMPLETED') {
        diagnosis.push('✅ Job completed successfully');
      } else if (job.status === 'COMPLETED_WITH_ERRORS') {
        diagnosis.push('⚠️ Job completed with some errors');
      } else {
        diagnosis.push('✅ Job appears healthy');
      }
    }

    const debugInfo = {
      job: {
        id: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        processedPages: job.processedPages,
        totalPages: job.totalPages,
        triggeredBy: job.triggeredBy,
        targetPageId: job.targetPageId,
      },
      timing: {
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        timeSinceCreationMs: timeSinceCreation,
        timeSinceUpdateMs: timeSinceUpdate,
        timeSinceStartMs: timeSinceStart,
        totalDurationMs: totalDuration,
        estimatedTimeRemainingMs,
        formattedDuration: formatDuration(totalDuration),
        formattedSinceUpdate: formatDuration(timeSinceUpdate),
      },
      phaseDetails: {
        currentPhase: job.phase,
        phaseProgressRange: currentPhaseProgress,
        phaseProgressPercentage: phaseProgressPercentage.toFixed(1) + '%',
        overallProgress: job.progress + '%',
      },
      errors: {
        totalErrors: errors.length,
        errorsByPhase,
        recentErrors: errors.slice(-5).map((e: any) => ({
          phase: e.phase,
          error: e.error,
          timestamp: e.timestamp,
          page: e.page,
        })),
      },
      health: {
        isStuck,
        isLongRunning,
        lastUpdateAge: formatDuration(timeSinceUpdate),
        diagnosis,
        nextExpectedAction,
      },
      recovery: {
        canRetry: job.status === 'FAILED' && errors.length < 3,
        canContinue: job.status === 'PROCESSING' && isStuck,
        suggestedAction: isStuck
          ? 'POST /api/jobs/[id]/process to resume processing'
          : job.status === 'FAILED'
            ? 'POST /api/jobs/[id]/retry to retry the job'
            : 'No action needed',
      },
    };

    return NextResponse.json(debugInfo);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error fetching debug info');
    return handleApiError(error);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}
