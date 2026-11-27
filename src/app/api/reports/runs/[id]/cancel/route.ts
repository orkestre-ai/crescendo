import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { prismaStore } from '@/lib/reports/store';
import { ACTIVE_STATUSES } from '@/lib/reports/types';

/**
 * POST /api/reports/runs/[id]/cancel
 *
 * Ask a run to stop. The loop reads the flag before its next step, so the
 * step in progress finishes first. A run that has already ended is left as
 * it is.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await prismaStore.getRun(id);
    if (!run) return NextResponse.json({ error: 'Report run not found' }, { status: 404 });

    if (ACTIVE_STATUSES.includes(run.status)) {
      await prismaStore.updateRun(id, { cancelRequested: true });
    }
    return NextResponse.json({
      runId: id,
      status: run.status,
      cancelRequested: ACTIVE_STATUSES.includes(run.status),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to cancel the report run');
  }
}
