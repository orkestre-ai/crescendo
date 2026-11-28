import { NextRequest, NextResponse } from 'next/server';
import { collectEnDaily, enDailyTotals } from '@/lib/en-daily';
import { errorResponse, validateCronSecret } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/cron/en-daily' });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/cron/en-daily?from=YYYY-MM-DD&to=YYYY-MM-DD[&page=<EN page id>...]
 *
 * Backfill daily Engaging Networks giving, with CRON_SECRET auth. The same
 * work as src/scripts/backfill-en-daily.ts, for the production image, which
 * has no source or tsx. It answers when the range is done, which can take
 * minutes: call it with no client timeout.
 */
export async function POST(request: NextRequest) {
  try {
    if (!validateCronSecret(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing cron secret' },
        { status: 401 }
      );
    }

    const params = request.nextUrl.searchParams;
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (!DATE.test(from) || !DATE.test(to)) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Give from and to as YYYY-MM-DD' },
        { status: 400 }
      );
    }
    const pageIds = params.getAll('page');

    const started = Date.now();
    const result = await collectEnDaily({
      from,
      to,
      pageIds: pageIds.length ? pageIds : undefined,
    });
    const totals = await enDailyTotals(from, to, pageIds.length ? pageIds : undefined);
    logger.info(
      { event: 'en_daily.backfill.completed', from, to, ...result, errors: result.errors.length },
      `EN daily backfill ${from} to ${to}: ${result.daysWritten} days written, ${result.errors.length} errors`
    );

    return NextResponse.json({
      from,
      to,
      ...result,
      totals,
      durationMs: Date.now() - started,
    });
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'EN daily backfill error'
    );
    return errorResponse(error, 'EN daily backfill failed');
  }
}
