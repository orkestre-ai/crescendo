import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/jobs/health' });

// Health check thresholds
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const LONG_RUNNING_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/jobs/health
 *
 * Get health status of job processing system.
 * Returns information about stuck, stale, and long-running jobs.
 */
export async function GET(_request: NextRequest) {
  try {
    logger.info({}, 'Running jobs health check');

    const now = new Date();
    const stuckThreshold = new Date(now.getTime() - STUCK_THRESHOLD_MS);
    const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);
    const longRunningThreshold = new Date(now.getTime() - LONG_RUNNING_THRESHOLD_MS);

    // Get all active jobs (PENDING or PROCESSING)
    const activeJobs = await prisma.collectionJob.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Categorize jobs
    const stuckJobs = activeJobs.filter((job) => {
      if (job.status !== 'PROCESSING') return false;
      return new Date(job.updatedAt) < stuckThreshold;
    });

    const staleJobs = activeJobs.filter((job) => {
      return new Date(job.updatedAt) < staleThreshold;
    });

    const longRunningJobs = activeJobs.filter((job) => {
      return new Date(job.startedAt) < longRunningThreshold;
    });

    const incompleteJobs = activeJobs.filter((job) => {
      return job.status === 'PROCESSING' && job.processedPages < job.totalPages;
    });

    // Get recent completed/failed jobs for context
    const recentJobs = await prisma.collectionJob.findMany({
      where: {
        status: {
          in: ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'],
        },
        completedAt: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });

    // Calculate job statistics
    const stats = {
      last24Hours: {
        completed: recentJobs.filter((j) => j.status === 'COMPLETED').length,
        completedWithErrors: recentJobs.filter((j) => j.status === 'COMPLETED_WITH_ERRORS').length,
        failed: recentJobs.filter((j) => j.status === 'FAILED').length,
      },
      current: {
        pending: activeJobs.filter((j) => j.status === 'PENDING').length,
        processing: activeJobs.filter((j) => j.status === 'PROCESSING').length,
        stuck: stuckJobs.length,
        stale: staleJobs.length,
        longRunning: longRunningJobs.length,
      },
    };

    // Determine overall health status
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    const issues: string[] = [];

    if (stuckJobs.length > 0) {
      healthStatus = 'critical';
      issues.push(
        `${stuckJobs.length} job(s) stuck (no updates for >${STUCK_THRESHOLD_MS / 60000}min)`
      );
    }

    if (staleJobs.length > 0 && healthStatus !== 'critical') {
      healthStatus = 'warning';
      issues.push(
        `${staleJobs.length} job(s) stale (no updates for >${STALE_THRESHOLD_MS / 60000}min)`
      );
    }

    if (longRunningJobs.length > 0 && healthStatus === 'healthy') {
      healthStatus = 'warning';
      issues.push(
        `${longRunningJobs.length} job(s) running for >${LONG_RUNNING_THRESHOLD_MS / 60000}min`
      );
    }

    // Format jobs for response
    const formatJob = (job: (typeof activeJobs)[0]) => ({
      id: job.id,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      processedPages: job.processedPages,
      totalPages: job.totalPages,
      triggeredBy: job.triggeredBy,
      startedAt: job.startedAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() || null,
      errorCount: (job.errors as any[])?.length || 0,
      timeSinceUpdateMs: now.getTime() - new Date(job.updatedAt).getTime(),
      runningDurationMs: now.getTime() - new Date(job.startedAt).getTime(),
    });

    const response = {
      status: healthStatus,
      timestamp: now.toISOString(),
      issues,
      statistics: stats,
      thresholds: {
        stuckAfterMs: STUCK_THRESHOLD_MS,
        staleAfterMs: STALE_THRESHOLD_MS,
        longRunningAfterMs: LONG_RUNNING_THRESHOLD_MS,
      },
      jobs: {
        active: activeJobs.map(formatJob),
        stuck: stuckJobs.map(formatJob),
        stale: staleJobs.map(formatJob),
        longRunning: longRunningJobs.map(formatJob),
        incomplete: incompleteJobs.map(formatJob),
        recent: recentJobs.map((job) => ({
          id: job.id,
          status: job.status,
          phase: job.phase,
          progress: job.progress,
          processedPages: job.processedPages,
          totalPages: job.totalPages,
          triggeredBy: job.triggeredBy,
          completedAt: job.completedAt?.toISOString() || null,
          durationMs: job.completedAt
            ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
            : null,
          errorCount: (job.errors as any[])?.length || 0,
        })),
      },
      recoveryActions: {
        stuckJobs: stuckJobs.map((job) => ({
          jobId: job.id,
          action: `POST /api/jobs/${job.id}/process`,
          description: `Continue processing stuck job (${job.phase} phase, ${job.processedPages}/${job.totalPages} pages)`,
        })),
        failedJobs: recentJobs
          .filter((j) => j.status === 'FAILED')
          .slice(0, 3)
          .map((job) => ({
            jobId: job.id,
            action: `POST /api/jobs/${job.id}/retry`,
            description: `Retry failed job (${(job.errors as any[])?.length || 0} errors)`,
          })),
      },
    };

    logger.info(
      { status: healthStatus, activeJobs: activeJobs.length, stuckJobs: stuckJobs.length, issueCount: issues.length },
      'Health check completed'
    );

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Health check failed');
    return handleApiError(error);
  }
}
