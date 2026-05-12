import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { resetSettings } from '@/lib/settings';
import { rootLogger } from '@/lib/logging';
import type { ClearDataResult, ErrorResponse } from '@/types/settings';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/clear' });

const clearDataSchema = z.object({
  categories: z.array(z.enum(['pages', 'recommendations', 'settings'])).min(1),
  confirmed: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = clearDataSchema.safeParse(body);

    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: parsed.error.flatten(),
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const { categories, confirmed } = parsed.data;

    if (!confirmed) {
      const errorResponse: ErrorResponse = {
        error: 'NOT_CONFIRMED',
        message: 'Please confirm the deletion by setting confirmed: true',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Check for active jobs
    const activeJob = await prisma.collectionJob.findFirst({
      where: { status: 'PROCESSING' },
    });

    if (activeJob) {
      const errorResponse: ErrorResponse = {
        error: 'JOB_IN_PROGRESS',
        message: 'Cannot clear data while a job is in progress. Please wait for it to complete.',
        details: { jobId: activeJob.id },
      };
      return NextResponse.json(errorResponse, { status: 409 });
    }

    const result: ClearDataResult = {
      success: true,
      cleared: {},
    };

    // Clear pages (this will cascade to snapshots due to Prisma cascade delete)
    if (categories.includes('pages')) {
      // Count snapshots first (they'll be deleted via cascade)
      const snapshotCount = await prisma.performanceSnapshot.count();
      const pageCount = await prisma.fundraisingPage.count();

      // Delete pages (snapshots cascade automatically)
      await prisma.fundraisingPage.deleteMany({});

      result.cleared.pages = pageCount;
      result.cleared.snapshots = snapshotCount;
    }

    // Clear recommendations
    if (categories.includes('recommendations')) {
      const recCount = await prisma.optimizationRecommendation.count();
      await prisma.optimizationRecommendation.deleteMany({});
      result.cleared.recommendations = recCount;
    }

    // Reset settings
    if (categories.includes('settings')) {
      await resetSettings();
      result.cleared.settingsReset = true;
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Clear data failed');
    const errorResponse: ErrorResponse = {
      error: 'CLEAR_DATA_ERROR',
      message: 'Failed to clear data',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
