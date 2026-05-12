import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/lib/api-helpers';
import { validateCuid } from '@/lib/validation';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'job', route: '/api/jobs/[id]/cancel' });

const TERMINAL_STATUSES = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'] as const;

/**
 * POST /api/jobs/[id]/cancel
 *
 * Flip a running job to CANCELLED. The background `runJobToCompletion`
 * loop and `JobProcessor` both inspect status between rounds/phases and
 * exit cleanly when they see CANCELLED, so we don't need to interrupt
 * mid-chunk work — the next safe checkpoint will bail.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invalidId = validateCuid(id);
    if (invalidId) return invalidId;

    const existing = await prisma.collectionJob.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (TERMINAL_STATUSES.includes(existing.status as (typeof TERMINAL_STATUSES)[number])) {
      return NextResponse.json(
        { error: 'Job already in terminal state', status: existing.status },
        { status: 409 }
      );
    }

    const job = await prisma.collectionJob.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    logger.info({ event: 'job.cancel.requested', jobId: id }, `Cancellation requested for job ${id}`);

    return NextResponse.json({ job });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'Cancel request failed'
    );
    return handleApiError(error);
  }
}
