import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { renderReportHtml } from '@/lib/reports/render';
import { renderMode, reportHtmlResponse } from '@/lib/reports/response';
import { prismaStore } from '@/lib/reports/store';

/**
 * GET /api/reports/runs/[id]/html?mode=screen|print
 *
 * The report as one self-contained HTML document: what the run page shows in
 * its frame and, with mode=print, the source of the PDF.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!(await prismaStore.getRun(id))) {
      return NextResponse.json({ error: 'Report run not found' }, { status: 404 });
    }
    const mode = renderMode(request.nextUrl.searchParams.get('mode'));
    return reportHtmlResponse(await renderReportHtml(id, { mode }));
  } catch (error) {
    return errorResponse(error, 'Failed to render the report');
  }
}
