import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api-helpers';
import { rootLogger } from '@/lib/logging';
import { ensureDefaultReportDefinitions } from '@/lib/reports/definitions';
import { resolveInputDefaults, validateRunInputs } from '@/lib/reports/definitions/inputs';
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
 * GET /api/reports/runs
 *
 * Every run, newest first, as the list of past reports shows them.
 */
export async function GET() {
  try {
    const runs = await prismaStore.listRuns();
    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        title: run.title,
        definitionKey: run.definitionSnapshot.key,
        definitionName: run.definitionSnapshot.name,
        preparedBy: run.preparedBy,
        status: run.status,
        statusReason: run.statusReason,
        stepCount: run.stepCount,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load the reports');
  }
}

/**
 * POST /api/reports/runs
 *
 * Start a report. The run continues in the background; follow it with
 * GET /api/reports/runs/[id]/events. Answers 409 while another report runs,
 * and 400 with an error per field when the inputs do not fit the
 * definition's form.
 */
export async function POST(request: NextRequest) {
  try {
    const body = startSchema.parse(await request.json());

    if (body.definitionKey) await ensureDefaultReportDefinitions();
    const definition = await prismaStore.findDefinition(
      body.definitionKey ? { key: body.definitionKey } : { id: body.definitionId! }
    );
    if (!definition) {
      return NextResponse.json(
        { error: `No report definition ${body.definitionKey ?? body.definitionId}` },
        { status: 404 }
      );
    }

    // en-CA writes a date as YYYY-MM-DD.
    const today = new Intl.DateTimeFormat('en-CA').format(new Date());
    const checked = validateRunInputs(resolveInputDefaults(definition.inputs, today), body.inputs);
    if (!checked.ok) {
      return NextResponse.json(
        { error: 'Some fields need attention.', code: 'INVALID_INPUTS', errors: checked.errors },
        { status: 400 }
      );
    }

    const { runId } = await startReportRun({
      definitionId: definition.id,
      inputs: checked.values,
      preparedBy: body.preparedBy?.trim() || undefined,
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
