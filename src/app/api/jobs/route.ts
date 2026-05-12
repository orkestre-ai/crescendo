import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { jobProcessor } from '@/lib/jobs';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';
import { getEnApiKey } from '@/lib/settings';
import { JobStatus } from '@prisma/client';

const logger = rootLogger.child({ journey: 'request', route: '/api/jobs' });

const createJobSchema = z.object({
  triggeredBy: z.enum(['cron', 'user', 'api', 'settings']).default('user'),
  jobType: z.literal('SYNC').default('SYNC'),
});

/**
 * Continue processing a job until it completes.
 * Runs in background, retrying up to maxRounds times.
 */
async function runJobToCompletion(jobId: string, maxRounds = 100) {
  let round = 0;

  while (round < maxRounds) {
    round++;

    // Check DB status before each round to respect external cancellation
    const currentJob = await prisma.collectionJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (currentJob && (currentJob.status === 'CANCELLED' || currentJob.status === 'FAILED')) {
      logger.info(
        { jobId, rounds: round, status: currentJob.status },
        `Job ${currentJob.status.toLowerCase()} externally, stopping continuation`
      );
      return;
    }

    try {
      const result = await jobProcessor.processJobToCompletion(jobId);

      if (result.done) {
        logger.info(
          { jobId, rounds: round, progress: result.progress },
          'Job completed via auto-continuation'
        );
        return;
      }

      logger.debug(
        { jobId, progress: result.progress, iterations: result.iterations },
        `Round ${round} complete, continuing...`
      );

      // Small delay between rounds
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), jobId }, `Error in round ${round}`);
      // Continue trying unless it's a fatal error
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  logger.warn({ jobId, rounds: round }, 'Job hit max rounds without completing');
}

/**
 * POST /api/jobs
 *
 * Create a new collection job (on-demand data collection)
 *
 * Request body:
 * - triggeredBy: 'cron' | 'user' | 'api'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid job parameters',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { triggeredBy } = parsed.data;

    // Validate EN API key is configured
    const enApiKey = await getEnApiKey();
    if (!enApiKey) {
      return NextResponse.json(
        {
          error: 'NO_API_KEY',
          message:
            'No Engaging Networks API key configured. Please add your API key in Settings first.',
        },
        { status: 400 }
      );
    }

    // Check if there's already a job in progress
    const activeJob = await prisma.collectionJob.findFirst({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (activeJob) {
      logger.warn({ existingJobId: activeJob.id }, 'Job already in progress');
      return NextResponse.json(
        {
          error: 'JOB_IN_PROGRESS',
          message: 'A job is already in progress.',
          details: {
            jobId: activeJob.id,
            job: {
              ...activeJob,
              startedAt: activeJob.startedAt.toISOString(),
              completedAt: activeJob.completedAt?.toISOString() || null,
              createdAt: activeJob.createdAt.toISOString(),
              updatedAt: activeJob.updatedAt.toISOString(),
            },
          },
        },
        { status: 409 }
      );
    }

    logger.info({ triggeredBy }, 'Creating new SYNC collection job');

    // Create the job
    const job = await jobProcessor.createCollectionJob(triggeredBy, 'SYNC');

    logger.info(
      { jobId: job.id, triggeredBy, totalPages: job.totalPages, initialPhase: job.phase },
      'Job created successfully'
    );

    // Start processing asynchronously with automatic continuation loop
    runJobToCompletion(job.id).catch((error) => {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), jobId: job.id }, 'Auto-continuation failed');
    });

    return NextResponse.json(
      {
        job: {
          ...job,
          startedAt: job.startedAt.toISOString(),
          completedAt: job.completedAt?.toISOString() || null,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
        },
        message: 'Collection job created and started',
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to create job');
    return handleApiError(error);
  }
}

/**
 * GET /api/jobs
 *
 * List recent collection jobs
 *
 * Query parameters:
 * - status: Filter by job status
 * - limit: Number of jobs to return (default: 10, max: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as JobStatus | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const where = status ? { status } : {};

    const jobs = await prisma.collectionJob.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const formattedJobs = jobs.map((job) => ({
      ...job,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));

    return NextResponse.json({ jobs: formattedJobs });
  } catch (error) {
    return handleApiError(error);
  }
}
