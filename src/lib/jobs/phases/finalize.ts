import type { Logger } from 'pino';
import type { CollectionJob } from '@prisma/client';
import { prisma } from '../../db';
import { createJobLogger } from '@/lib/logging/journeys';
import type { PhaseResult } from './types';

export async function processFinalizePhase(
  job: CollectionJob,
  _deps: { logger: Logger }
): Promise<PhaseResult> {
  const jobLogger = createJobLogger(job.id, job.jobType);

  // Calculate total duration
  const totalDuration = Date.now() - new Date(job.createdAt).getTime();
  const totalErrors = (job.errors as any[])?.length || 0;

  // Finalize the job — restore processedPages to totalPages since phase transitions reset it to 0
  const pageCount = job.targetPageId ? 1 : job.totalPages;
  await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      status: totalErrors > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      progress: 100,
      processedPages: pageCount,
      completedAt: new Date(),
    },
  });

  // Refresh cached page count so the settings GET endpoint doesn't re-run COUNT(*) per request.
  const localPageCount = await prisma.fundraisingPage.count();
  await prisma.appSettings.updateMany({
    data: { localPageCount },
  });

  // Log job completion
  jobLogger.completed(pageCount, totalErrors, totalDuration);

  const message = job.targetPageId
    ? 'Debug finalization complete.'
    : 'Job completed successfully';

  return { done: true, progress: 100, message };
}
