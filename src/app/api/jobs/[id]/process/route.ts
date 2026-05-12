import { NextRequest, NextResponse } from 'next/server';
import { jobProcessor } from '@/lib/jobs';
import { handleApiError } from '@/lib/api-helpers';
import { validateCuid } from '@/lib/validation';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'job', route: '/api/jobs/[id]/process' });

/**
 * POST /api/jobs/[id]/process
 *
 * Process a job to completion. Used as a manual recovery endpoint
 * for stuck jobs.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invalidId = validateCuid(id);
    if (invalidId) return invalidId;

    logger.info({ jobId: id }, 'Manual job recovery triggered');

    const result = await jobProcessor.processJobToCompletion(id);

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Manual job recovery failed');
    return handleApiError(error);
  }
}
