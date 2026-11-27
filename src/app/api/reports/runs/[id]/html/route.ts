import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { reportFileName } from '@/lib/reports/filename';
import { renderReportHtml } from '@/lib/reports/render';
import { renderMode, reportHtmlResponse } from '@/lib/reports/response';
import { prismaStore } from '@/lib/reports/store';

/**
 * GET /api/reports/runs/[id]/html?mode=screen|print[&download=1]
 *
 * The report as one self-contained HTML document: what the run page shows in
 * its frame and, with mode=print, the source of the PDF. With download=1 the
 * same document is sent as a file to save.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await prismaStore.getRun(id);
    if (!run) {
      return NextResponse.json({ error: 'Report run not found' }, { status: 404 });
    }
    const query = request.nextUrl.searchParams;
    const mode = renderMode(query.get('mode'));
    const fileName = query.get('download') === '1' ? reportFileName(run, 'html') : undefined;
    return reportHtmlResponse(await renderReportHtml(id, { mode }), fileName);
  } catch (error) {
    return errorResponse(error, 'Failed to render the report');
  }
}
