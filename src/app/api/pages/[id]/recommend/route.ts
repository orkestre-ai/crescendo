import { NextRequest, NextResponse } from 'next/server';
import { jobProcessor } from '@/lib/jobs';
import { handleApiError } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/pages/[id]/recommend' });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await jobProcessor.createSinglePageJob(id, 'GENERATING_RECS', 'manual');

    // Process in background — job saves OptimizationRecommendation records on completion
    jobProcessor.processJobToCompletion(job.id).catch((err) =>
      logger.error({ err: err instanceof Error ? err : new Error(String(err)) }, 'Recommendation generation error')
    );

    return NextResponse.json(
      {
        jobId: job.id,
        status: 'started',
        message: 'Recommendation generation started',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
