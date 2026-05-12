/**
 * Test script for debugging the refresh data function.
 *
 * This script creates a test job and monitors its progress with detailed logging.
 * It can detect when a job hangs and provide diagnostic information.
 *
 * Usage:
 *   npx tsx src/scripts/test-refresh-debug.ts
 *
 * Options:
 *   --no-create    Don't create a new job, just monitor existing jobs
 *   --job-id=XXX   Monitor a specific job ID
 *   --continue     Manually trigger continuation for stuck jobs
 *   --health       Just run health check
 */

import { prisma } from '../lib/db';
import { jobProcessor } from '../lib/jobs';

// Configuration
const POLL_INTERVAL_MS = 2000;
const STUCK_THRESHOLD_MS = 30000; // 30 seconds for testing
const MAX_WAIT_TIME_MS = 10 * 60 * 1000; // 10 minutes max wait

interface JobStatus {
  id: string;
  status: string;
  phase: string;
  progress: number;
  processedPages: number;
  totalPages: number;
  errors: any[];
  updatedAt: Date;
}

async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const job = await prisma.collectionJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return null;

  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    processedPages: job.processedPages,
    totalPages: job.totalPages,
    errors: job.errors as any[],
    updatedAt: job.updatedAt,
  };
}

async function runHealthCheck() {
  console.log('\n🏥 Running Health Check...\n');

  const now = new Date();

  // Get all active jobs
  const activeJobs = await prisma.collectionJob.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get recent completed/failed jobs
  const recentJobs = await prisma.collectionJob.findMany({
    where: {
      completedAt: {
        gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { completedAt: 'desc' },
    take: 5,
  });

  console.log('='.repeat(60));
  console.log('Active Jobs:', activeJobs.length);
  console.log('='.repeat(60));

  for (const job of activeJobs) {
    const timeSinceUpdate = now.getTime() - new Date(job.updatedAt).getTime();
    const isStuck = job.status === 'PROCESSING' && timeSinceUpdate > STUCK_THRESHOLD_MS;

    console.log(`\nJob: ${job.id.slice(0, 8)}...`);
    console.log(`  Status: ${job.status} ${isStuck ? '⚠️ STUCK' : ''}`);
    console.log(`  Phase: ${job.phase}`);
    console.log(`  Progress: ${job.progress}%`);
    console.log(`  Pages: ${job.processedPages}/${job.totalPages}`);
    console.log(`  Last Update: ${Math.round(timeSinceUpdate / 1000)}s ago`);
    console.log(`  Errors: ${(job.errors as any[])?.length || 0}`);

    if (isStuck) {
      console.log(`\n  💡 To process: POST /api/jobs/${job.id}/process`);
      console.log(
        `  💡 Or run: npx tsx src/scripts/test-refresh-debug.ts --continue --job-id=${job.id}`
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Recent Completed Jobs:', recentJobs.length);
  console.log('='.repeat(60));

  for (const job of recentJobs) {
    const duration = job.completedAt
      ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
      : null;

    console.log(`\nJob: ${job.id.slice(0, 8)}...`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Duration: ${duration ? `${Math.round(duration / 1000)}s` : 'N/A'}`);
    console.log(`  Pages: ${job.processedPages}/${job.totalPages}`);
    console.log(`  Errors: ${(job.errors as any[])?.length || 0}`);
  }

  console.log('\n');
}

async function monitorJob(jobId: string) {
  console.log(`\n📊 Monitoring Job: ${jobId}\n`);

  const startTime = Date.now();
  let lastProgress = -1;
  let lastProgressTime = Date.now();
  let iterationCount = 0;

  while (true) {
    iterationCount++;
    const elapsed = Date.now() - startTime;

    // Check max wait time
    if (elapsed > MAX_WAIT_TIME_MS) {
      console.log(`\n⏰ Max wait time exceeded (${MAX_WAIT_TIME_MS / 1000}s). Exiting.`);
      break;
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      console.log(`❌ Job ${jobId} not found!`);
      break;
    }

    const timeSinceProgress = Date.now() - lastProgressTime;
    const isStuck = status.status === 'PROCESSING' && timeSinceProgress > STUCK_THRESHOLD_MS;

    // Only log if progress changed or stuck
    if (status.progress !== lastProgress || isStuck) {
      const timestamp = new Date().toISOString().slice(11, 23);
      console.log(
        `[${timestamp}] ${status.status.padEnd(12)} | ` +
          `Phase: ${status.phase.padEnd(16)} | ` +
          `Progress: ${status.progress.toString().padStart(3)}% | ` +
          `Pages: ${status.processedPages}/${status.totalPages} | ` +
          `Errors: ${status.errors?.length || 0}` +
          (isStuck ? ' ⚠️ STUCK' : '')
      );

      if (status.progress !== lastProgress) {
        lastProgress = status.progress;
        lastProgressTime = Date.now();
      }
    }

    // Check for completion
    if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'].includes(status.status)) {
      console.log(`\n✅ Job finished with status: ${status.status}`);
      console.log(`   Total time: ${Math.round(elapsed / 1000)}s`);
      console.log(`   Iterations: ${iterationCount}`);

      if (status.errors?.length > 0) {
        console.log(`\n⚠️ Errors (${status.errors.length}):`);
        status.errors.slice(0, 5).forEach((err, i) => {
          console.log(`   ${i + 1}. [${err.phase}] ${err.error}`);
        });
        if (status.errors.length > 5) {
          console.log(`   ... and ${status.errors.length - 5} more`);
        }
      }
      break;
    }

    // Detect stuck job
    if (isStuck) {
      console.log(
        `\n⚠️ Job appears stuck! No progress for ${Math.round(timeSinceProgress / 1000)}s`
      );
      console.log(
        `   Current state: ${status.phase} phase, ${status.processedPages}/${status.totalPages} pages`
      );
      console.log(`\n💡 Debug this job:`);
      console.log(`   curl http://localhost:3000/api/jobs/${jobId}/debug`);
      console.log(`\n💡 To process:`);
      console.log(`   curl -X POST http://localhost:3000/api/jobs/${jobId}/process`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function createAndMonitorJob() {
  console.log('\n🚀 Creating new collection job...\n');

  try {
    const job = await jobProcessor.createCollectionJob('debug-script', 'SYNC');

    console.log(`✅ Job created: ${job.id}`);
    console.log(`   Total pages: ${job.totalPages}`);
    console.log(`   Initial phase: ${job.phase}`);

    console.log('\n📡 Starting job processing...\n');

    // Start processing in background
    jobProcessor
      .processJobToCompletion(job.id)
      .then((result) => {
        console.log(`\n🎉 Job processing finished:`);
        console.log(`   Done: ${result.done}`);
        console.log(`   Progress: ${result.progress}%`);
        console.log(`   Iterations: ${result.iterations}`);
        console.log(`   Duration: ${result.durationMs}ms`);
        console.log(`   Message: ${result.message}`);
      })
      .catch((error) => {
        console.error(`\n❌ Job processing error:`, error.message);
      });

    // Monitor the job
    await monitorJob(job.id);
  } catch (error) {
    console.error('❌ Failed to create job:', error);
    throw error;
  }
}

async function continueJob(jobId: string) {
  console.log(`\n🔄 Continuing job: ${jobId}\n`);

  const job = await prisma.collectionJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    console.log(`❌ Job ${jobId} not found!`);
    return;
  }

  console.log(`Current status: ${job.status}`);
  console.log(`Current phase: ${job.phase}`);
  console.log(`Progress: ${job.progress}%`);
  console.log(`Pages: ${job.processedPages}/${job.totalPages}`);

  if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED'].includes(job.status)) {
    console.log(`\n⚠️ Job already finished with status: ${job.status}`);
    return;
  }

  if (job.status === 'FAILED') {
    console.log(`\n⚠️ Job has failed. Consider creating a new job instead.`);
    return;
  }

  console.log(`\n📡 Starting continuation...\n`);

  jobProcessor
    .processJobToCompletion(jobId)
    .then((result) => {
      console.log(`\n🎉 Continuation finished:`);
      console.log(`   Done: ${result.done}`);
      console.log(`   Progress: ${result.progress}%`);
      console.log(`   Iterations: ${result.iterations}`);
      console.log(`   Duration: ${result.durationMs}ms`);
    })
    .catch((error) => {
      console.error(`\n❌ Continuation error:`, error.message);
    });

  // Monitor the job
  await monitorJob(jobId);
}

async function main() {
  const args = process.argv.slice(2);

  const noCreate = args.includes('--no-create');
  const shouldContinue = args.includes('--continue');
  const healthOnly = args.includes('--health');
  const jobIdArg = args.find((arg) => arg.startsWith('--job-id='));
  const jobId = jobIdArg?.split('=')[1];

  console.log('='.repeat(60));
  console.log('🔍 Refresh Data Debug Script');
  console.log('='.repeat(60));

  try {
    if (healthOnly) {
      await runHealthCheck();
    } else if (shouldContinue && jobId) {
      await continueJob(jobId);
    } else if (jobId) {
      await monitorJob(jobId);
    } else if (noCreate) {
      await runHealthCheck();
    } else {
      await createAndMonitorJob();
    }
  } catch (error) {
    console.error('\n❌ Script error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
