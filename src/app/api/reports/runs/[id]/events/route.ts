import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { prismaStore } from '@/lib/reports/store';

/**
 * GET /api/reports/runs/[id]/events?after=<seq>
 *
 * The run's activity log after event `seq` (all of it when left out), with
 * the progress a poller shows beside it: status, steps and tokens so far.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const after = Number(request.nextUrl.searchParams.get('after') ?? 0);
    if (!Number.isInteger(after) || after < 0) {
      return NextResponse.json({ error: '"after" must be a whole number' }, { status: 400 });
    }

    const run = await prismaStore.getRun(id);
    if (!run) return NextResponse.json({ error: 'Report run not found' }, { status: 404 });

    const events = await prismaStore.listEvents(id, after);
    return NextResponse.json({
      events,
      run: {
        status: run.status,
        statusReason: run.statusReason,
        stepCount: run.stepCount,
        usage: run.usage,
        cancelRequested: run.cancelRequested,
      },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load the report events');
  }
}
