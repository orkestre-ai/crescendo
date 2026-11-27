import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { renderGalleryHtml } from '@/lib/reports/render';
import { renderMode, reportHtmlResponse } from '@/lib/reports/response';

/**
 * GET /api/reports/blocks/gallery/html?mode=screen|print
 *
 * Every block a report can use, drawn with its sample data.
 */
export async function GET(request: NextRequest) {
  try {
    const mode = renderMode(request.nextUrl.searchParams.get('mode'));
    return reportHtmlResponse(await renderGalleryHtml({ mode }));
  } catch (error) {
    return errorResponse(error, 'Failed to render the block gallery');
  }
}
