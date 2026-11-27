import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { reportFileName } from '@/lib/reports/filename';
import { renderReportPdf } from '@/lib/reports/pdf';
import { attachment } from '@/lib/reports/response';
import { prismaStore } from '@/lib/reports/store';

/**
 * GET /api/reports/runs/[id]/pdf
 *
 * The report as a Letter PDF with a footer on every page. Made on each
 * request and not stored, so it always shows the report as it is now.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await prismaStore.getRun(id);
    if (!run) {
      return NextResponse.json({ error: 'Report run not found' }, { status: 404 });
    }
    const pdf = await renderReportPdf(id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        ...attachment(reportFileName(run, 'pdf')),
      },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to make the PDF');
  }
}
