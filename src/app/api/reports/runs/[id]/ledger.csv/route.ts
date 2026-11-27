import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { reportFileName } from '@/lib/reports/filename';
import { ledgerToCsv } from '@/lib/reports/ledger-csv';
import { attachment } from '@/lib/reports/response';
import { prismaStore } from '@/lib/reports/store';

/**
 * GET /api/reports/runs/[id]/ledger.csv
 *
 * The ledger as a spreadsheet: every figure with the query, or queries,
 * behind it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await prismaStore.getRun(id);
    if (!run) {
      return NextResponse.json({ error: 'Report run not found' }, { status: 404 });
    }
    const [figures, queries] = await Promise.all([
      prismaStore.listFigures(id),
      prismaStore.listQueries(id),
    ]);
    // The byte-order mark tells Excel the file is UTF-8, so "$" and "−" survive.
    return new NextResponse(`﻿${ledgerToCsv(figures, queries)}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
        ...attachment(reportFileName(run, 'csv')),
      },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to export the ledger');
  }
}
