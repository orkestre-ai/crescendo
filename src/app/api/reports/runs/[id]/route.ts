import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { prismaStore } from '@/lib/reports/store';

/**
 * GET /api/reports/runs/[id]
 *
 * The run with its ledger: figures, datasets and the saved queries. The rows
 * of each query are left out; they can run to a thousand rows apiece.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await prismaStore.getRun(id);
    if (!run) return NextResponse.json({ error: 'Report run not found' }, { status: 404 });

    const [figures, datasets, queries] = await Promise.all([
      prismaStore.listFigures(id),
      prismaStore.listDatasets(id),
      prismaStore.listQueries(id),
    ]);

    return NextResponse.json({
      run,
      figures,
      datasets,
      queries: queries.map((query) => ({ ...query, result: undefined })),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load the report run');
  }
}
