import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';
import { ensureDefaultReportDefinitions } from '@/lib/reports/definitions';
import {
  ReportBusyError,
  ReportDefinitionNotFoundError,
  runReport,
  startReportRun,
} from '@/lib/reports/runner';
import { prismaStore } from '@/lib/reports/store';

const logger = rootLogger.child({ journey: 'report', route: '/api/reports/runs' });

const startSchema = z
  .object({
    definitionId: z.string().optional(),
    definitionKey: z.string().optional(),
    inputs: z.record(z.string(), z.string()).default({}),
    preparedBy: z.string().max(200).optional(),
  })
  .refine((body) => Boolean(body.definitionId) !== Boolean(body.definitionKey), {
    message: 'Give definitionId or definitionKey, not both.',
  });

/**
 * POST /api/reports/runs
 *
 * Start a report. The run continues in the background; follow it with
 * GET /api/reports/runs/[id]/events. Answers 409 while another report runs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = startSchema.parse(await request.json());

    let definitionId = body.definitionId;
    if (body.definitionKey) {
      await ensureDefaultReportDefinitions();
      const definition = await prismaStore.findDefinition({ key: body.definitionKey });
      if (!definition) {
        return NextResponse.json(
          { error: `No report definition with key ${body.definitionKey}` },
          { status: 404 }
        );
      }
      definitionId = definition.id;
    }

    const { runId } = await startReportRun({
      definitionId,
      inputs: body.inputs,
      preparedBy: body.preparedBy,
    });
    logger.info({ runId, event: 'report.started' }, 'Report run started');

    // Runs in the background. runReport records its own failures on the run.
    void runReport(runId);

    return NextResponse.json({ runId }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportBusyError) {
      return NextResponse.json(
        { error: error.message, code: 'REPORT_IN_PROGRESS', runId: error.runId },
        { status: 409 }
      );
    }
    if (error instanceof ReportDefinitionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return errorResponse(error, 'Failed to start the report');
  }
}
