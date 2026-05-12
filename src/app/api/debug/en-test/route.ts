import { NextRequest, NextResponse } from 'next/server';
import { enClient } from '@/lib/engaging-networks';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/debug/en-test' });

/**
 * GET /api/debug/en-test
 *
 * Debug endpoint to test Engaging Networks API connectivity and responses
 * Tests authentication and page listing
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const type = searchParams.get('type') || 'nd';
    const status = searchParams.get('status') || ''; // Empty = all (EN doesn't return status in list)

    logger.info({ limit, offset, type, status }, 'Starting EN API test');

    const startTime = Date.now();

    // Test the getPages call
    const pages = await enClient.getPages({
      type,
      status,
      limit,
      offset,
    });

    const duration = Date.now() - startTime;

    logger.info(
      { pagesReturned: pages.length, durationMs: duration, firstPageId: pages[0]?.id },
      `EN API test successful — ${pages.length} pages (${duration}ms)`
    );

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      request: {
        type,
        status,
        limit,
        offset,
      },
      response: {
        pageCount: pages.length,
        hasMore: pages.length === limit,
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name,
          url: p.url,
          type: p.type,
          status: p.status,
          createdDate: p.createdDate,
          modifiedDate: p.modifiedDate,
        })),
      },
    });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'EN API test failed');

    return handleApiError(error);
  }
}
