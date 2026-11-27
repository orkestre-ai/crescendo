import { generateText, stepCountIs, type LanguageModel, type ModelMessage, type Tool } from 'ai';
import { runGa4Report } from '@/lib/ai-tools/ga4-report';
import { estimateTokens } from '@/lib/ai/context';
import { getGenerationOptions, getProviderConfig, getProviderModel } from '@/lib/ai/providers';
import { allTools, getToolInstructions } from '@/lib/ai/tools';
import { rootLogger } from '@/lib/logging';
import { getOrCreateSettings } from '@/lib/settings';
import { lintProse, withProseWarnings } from './blocks/lint';
import { runBlocks, runLedger } from './blocks/resolve';
import { pruneMessages } from './context';
import { buildReportPrompt } from './definitions/inputs';
import { datasetQueryKeys } from './ledger';
import { recheckRun, type RecheckResult } from './recheck';
import { prismaStore, type ReportStore } from './store';
import { createReportTools } from './tools';
import {
  ACTIVE_STATUSES,
  type DefinitionSnapshot,
  type ReportRunStatus,
  type ReportUsage,
} from './types';

const log = rootLogger.child({ journey: 'report' });

/** Steps the model gets to revise the report after a recheck changed a figure. */
export const CORRECTION_STEPS = 20;
// Thinking counts against the output cap, as it does for chat.
const MAX_OUTPUT_TOKENS = 32_000;
// After a clear, the working messages are at or under this share of the cap.
const PRUNE_TARGET = 0.6;
// Steps in a row with no tool call before the run gives up.
const MAX_IDLE_STEPS = 3;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Thrown when a run is started while another is queued, running or rechecking. */
export class ReportBusyError extends Error {
  constructor(public readonly runId: string) {
    super('Another report is running. Only one report runs at a time.');
  }
}

export class ReportDefinitionNotFoundError extends Error {}

export interface RunDeps {
  store?: ReportStore;
  /** Defaults to the Reports model from Settings. */
  model?: LanguageModel;
  now?: () => Date;
  /** The data tools by key. Defaults to the shared registry. */
  tools?: Record<string, Tool>;
  /** Reads the GA4 property's time zone and currency. Defaults to one tiny ga4_report. */
  property?: () => Promise<{ timeZone: string; currencyCode: string }>;
  /** The input cap per call, in tokens. Defaults to the Reports setting. */
  maxContext?: number;
  /** Fills {{organizationName}} in the prompt. Defaults to the name in Settings. */
  organizationName?: string;
}

const REPORTER_PREAMBLE = `You are the analyst behind a Crescendo report. You work alone and in the background: nobody answers questions while you run, so decide for yourself and keep going until the report is done.

## How the ledger works

Every number in the report comes from the ledger, and Crescendo computes the ledger, not you.

1. Run queries with the data tools. Each result is saved and comes back with a "query" key (q1, q2, ...).
2. Record each figure you will rely on with record_figure. You give its source, and Crescendo computes the value and returns it:
   - cell: one value from one row of a query. "where" must match exactly one row.
   - aggregate: sum, avg, min, max or count over the rows of a query, all of them or those matching "where".
   - formula: arithmetic over figures already recorded, e.g. expr "revenue / sessions" with refs { "revenue": "revenue_7d", "sessions": "sessions_7d" }.
   - stated: only for something no query can produce. It is listed in the report as not machine-checked.
3. Build each table with define_dataset from saved queries. Crescendo computes it and returns it.

Never type a number you worked out yourself, and never do arithmetic in your head: record a figure or define a dataset and read the value back. In notes and summaries, name figures by their key or quote the value Crescendo returned.

A percent figure is stored as a fraction (0.25 means 25%). GA4 rates are already fractions. Do not multiply by 100.

## The document

The report a person reads is a list of blocks, in page order: a header, section headings, cards, tiles, tables, charts, cautions and prose. Call list_blocks once to see each block's key, what it is for and the shape of data it takes, then place blocks with add_block. update_block replaces a block's data and remove_block takes one out.

A block never holds a number you typed:
- where a block's shape marks a slot "x-ref": "figure", give { "figure": "<figure key>" };
- where it marks a slot "x-ref": "dataset", give { "dataset": "<dataset key>" };
- inside any text, write {{fig:<figure key>}} where the number belongs, and Crescendo puts the figure there as the ledger shows it.

A figure is written with its own sign: a fall of 2.3% appears as -2.3%. So put no direction word in front of a change that may be negative ("slipped {{fig:avg_change}}" would read "slipped -2.3%"). Write "the average gift changed by {{fig:avg_change}}", or record the size of the fall as its own figure (a formula, expr "0 - change") and write "fell {{fig:avg_fall}}".

Crescendo keeps one figure itself: emails_removed, the number of email addresses it took out of query results before you saw them. Write {{fig:emails_removed}} where the report says what was done about personal data; do not record it.

So record the figures and define the datasets a block needs before you add it. add_block checks the data against the ledger and draws the block once; if something is wrong it tells you what, and you fix it and call it again. Numbers typed into wording are checked against the ledger afterwards and listed as warnings on the report. Dates, years and times of day are fine to type.

## Rules for queries

- Dates are absolute, YYYY-MM-DD. Today is given in your first message. End every date range at yesterday or earlier: today's data is incomplete.
- Sessions and users do not add up across rows: a visit that runs past midnight is in two days' rows, one visit reaches many pages, and GA4 estimates each row's count on its own, so even channels or devices do not sum to GA4's total. Take a total of sessions or users from a query with no dimension but dateRange, as a cell. Revenue and gifts do add up.
- When a result is truncated, do not treat the list as complete: narrow it, raise the limit or read on with offset. When a result is sampled or thresholded, say so in a note.
- Old query results are cleared from this conversation to save space. The rows are kept: read_query reads them back, and figures and datasets still compute from them.

## Finishing

Use note for findings, doubts and decisions about method as you go. When the document is complete, call finish_report; it is refused while the report has no blocks. Crescendo then runs every saved query a second time and recomputes the ledger; if a figure changed you are told and get a short turn to revise. If you cannot continue, because tracking is broken or the data does not exist, call needs_attention with the reason. The run cannot be paused or resumed.`;

const NUDGE =
  'Carry on. When the report is complete call finish_report. If you cannot continue, call needs_attention with the reason.';

/** A date in a time zone, as YYYY-MM-DD. en-CA formats dates that way. */
function dateIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

function dayBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

// One one-token report. Every GA4 response carries the property's time zone
// and currency, whatever it is asked. The day only has to be in the past in
// every time zone.
async function readProperty(): Promise<{ timeZone: string; currencyCode: string }> {
  const day = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const { timeZone, currencyCode } = await runGa4Report({
    dimensions: [],
    metrics: ['sessions'],
    dateRanges: [{ startDate: day, endDate: day }],
    limit: 1,
  });
  return { timeZone, currencyCode };
}

function correctionMessage(recheck: RecheckResult): string {
  const figures = recheck.changedFigures.map(
    (f) => `- ${f.key}: was ${f.beforeDisplay}, is now ${f.afterDisplay}`
  );
  return [
    'Crescendo ran every saved query a second time and recomputed the ledger. Some results differed from the first run, so the ledger now holds the second-run values.',
    figures.length ? `Figures that changed:\n${figures.join('\n')}` : 'No figure changed.',
    recheck.changedDatasets.length
      ? `Datasets that changed: ${recheck.changedDatasets.join(', ')}`
      : '',
    `Queries whose rows changed: ${recheck.changedQueries.join(', ') || 'none'}. read_query shows their new rows.`,
    'No new queries can be run. If a change alters a finding, revise it: record figures again, define datasets again, and write a note saying what changed. Then call finish_report again. If nothing needs revising, call finish_report straight away.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Create a run, ready for runReport. One report runs at a time: this throws
 * ReportBusyError while another is queued, running or rechecking.
 */
export async function startReportRun(
  args: {
    definitionId?: string;
    definition?: DefinitionSnapshot;
    inputs: Record<string, string>;
    preparedBy?: string;
  },
  deps: { store?: ReportStore } = {}
): Promise<{ runId: string }> {
  const store = deps.store ?? prismaStore;

  const active = await store.findActiveRun();
  if (active) throw new ReportBusyError(active.id);

  let snapshot = args.definition;
  if (args.definitionId) {
    const found = await store.findDefinition({ id: args.definitionId });
    if (!found) {
      throw new ReportDefinitionNotFoundError(`No report definition with id ${args.definitionId}`);
    }
    snapshot = {
      key: found.key,
      name: found.name,
      prompt: found.prompt,
      enabledTools: found.enabledTools,
      maxSteps: found.maxSteps,
      maxMinutes: found.maxMinutes,
    };
  }
  if (!snapshot) throw new Error('Give a definitionId or a definition.');

  const run = await store.createRun({
    definitionId: args.definitionId ?? null,
    definitionSnapshot: snapshot,
    title: snapshot.name,
    preparedBy: args.preparedBy ?? null,
    inputs: args.inputs,
  });
  await store.appendEvent(run.id, 'status', 'Queued');
  return { runId: run.id };
}

/**
 * Drive a queued run to its end: one model call per step, with a cancel
 * check, the step and time guards and context clearing between steps, then
 * the recheck and, if it changed anything, a short correction turn. Never
 * throws: an error ends the run as FAILED with the reason.
 */
export async function runReport(runId: string, deps: RunDeps = {}): Promise<void> {
  const store = deps.store ?? prismaStore;
  const now = deps.now ?? (() => new Date());

  const end = async (status: ReportRunStatus, reason: string | null) => {
    await store.updateRun(runId, { status, statusReason: reason, completedAt: now() });
    await store.appendEvent(runId, 'status', reason ?? 'Completed', { status });
    log.info({ runId, status, reason, event: 'report.ended' }, `Report run ${status}`);
  };

  try {
    await drive(runId, store, now, deps, end);
  } catch (err) {
    log.error({ err, runId, event: 'report.failed' }, 'Report run failed');
    try {
      await end('FAILED', errorMessage(err));
    } catch (endErr) {
      log.error({ err: endErr, runId }, 'Could not record the failure of a report run');
    }
  }
}

async function drive(
  runId: string,
  store: ReportStore,
  now: () => Date,
  deps: RunDeps,
  end: (status: ReportRunStatus, reason: string | null) => Promise<void>
): Promise<void> {
  const run = await store.getRun(runId);
  if (!run) throw new Error(`No report run with id ${runId}`);
  if (run.status !== 'QUEUED') return;

  const definition = run.definitionSnapshot;
  const startedAt = now();
  await store.updateRun(runId, { status: 'RUNNING', startedAt });

  // The model
  let model = deps.model;
  let generation: ReturnType<typeof getGenerationOptions> = {};
  let maxContext = deps.maxContext;
  let organizationName = deps.organizationName;
  if (!model) {
    const settings = await getOrCreateSettings();
    const config = await getProviderConfig('reports', settings);
    if (!config.apiKey && config.provider !== 'ollama') {
      return end('FAILED', `No API key configured for ${config.provider}. Add one in Settings.`);
    }
    model = getProviderModel(config.provider, config.modelId, config.apiKey, config.baseUrl);
    generation = getGenerationOptions(config, 'reports');
    maxContext ??= settings.aiReportsMaxContext;
    organizationName ??= settings.organizationName ?? undefined;
    await store.appendEvent(runId, 'status', `Running on ${config.modelId}`, {
      status: 'RUNNING',
      provider: config.provider,
      modelId: config.modelId,
    });
  } else {
    await store.appendEvent(runId, 'status', 'Running', { status: 'RUNNING' });
  }
  const contextCap = maxContext ?? 150_000;

  // The property's time zone and currency, and today's date there
  const property = await (deps.property ?? readProperty)();
  await store.updateRun(runId, property);
  const today = dateIn(property.timeZone, now());
  const yesterday = dayBefore(today);

  // The tools
  const registry: Record<string, Tool> = deps.tools ?? allTools;
  const dataTools: Record<string, Tool> = {};
  for (const key of definition.enabledTools) {
    if (registry[key]) dataTools[key] = registry[key];
    else await store.appendEvent(runId, 'warning', `The tool "${key}" does not exist; skipped.`);
  }
  const { tools, signals } = createReportTools(store, runId, dataTools, {
    currencyCode: property.currencyCode,
  });

  const system = [
    REPORTER_PREAMBLE,
    `## Data tools\n\n${getToolInstructions(definition.enabledTools)}`,
    `## This report: ${definition.name}\n\n${buildReportPrompt(definition, run.inputs, {
      today,
      organizationName: organizationName ?? '',
      timeZone: property.timeZone,
      currency: property.currencyCode,
      preparedBy: run.preparedBy ?? '',
    })}`,
  ].join('\n\n');

  let messages: ModelMessage[] = [
    {
      role: 'user',
      content: `Today is ${today} in the property's time zone (${property.timeZone}). The last full day is ${yesterday}. The property's currency is ${property.currencyCode}. Start the report now.`,
    },
  ];
  const usage: ReportUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, steps: 0 };

  // One model call. Returns how many tools it called.
  const step = async (): Promise<number> => {
    if (estimateTokens(system) + estimateTokens(messages) > contextCap) {
      const figures = await store.listFigures(runId);
      const datasets = await store.listDatasets(runId);
      const usedQueries = new Set([
        ...figures.flatMap((figure) => figure.queryKeys),
        ...datasets.flatMap((dataset) => datasetQueryKeys(dataset.spec)),
      ]);
      const target = contextCap * PRUNE_TARGET - estimateTokens(system);
      const pruned = pruneMessages(messages, target, { usedQueries });
      if (pruned.cleared > 0) {
        messages = pruned.messages;
        await store.appendEvent(
          runId,
          'status',
          `Cleared ${pruned.cleared} old query results from working memory. The rows are kept.`
        );
      }
    }

    const result = await generateText({
      model: model!,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(1),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...generation,
    });
    messages.push(...result.response.messages);

    const cached = result.usage.inputTokenDetails?.cacheReadTokens ?? 0;
    usage.inputTokens += (result.usage.inputTokens ?? 0) - cached;
    usage.cachedInputTokens += cached;
    usage.outputTokens += result.usage.outputTokens ?? 0;
    usage.steps += 1;
    await store.updateRun(runId, { usage, stepCount: usage.steps });

    if (result.finishReason === 'length') {
      await store.appendEvent(
        runId,
        'warning',
        `Step ${usage.steps} hit the output limit and may have been cut short.`
      );
    }
    return result.toolCalls.length;
  };

  // True when the run was ended from outside or a person cancelled it.
  const interrupted = async (): Promise<boolean> => {
    const current = await store.getRun(runId);
    if (!current || !ACTIVE_STATUSES.includes(current.status)) return true;
    if (current.cancelRequested) {
      await end('CANCELLED', 'Cancelled. The queries, ledger and notes so far are kept.');
      return true;
    }
    return false;
  };

  // The main loop
  let idle = 0;
  while (!signals.finish) {
    if (await interrupted()) return;
    if (usage.steps >= definition.maxSteps) {
      return end(
        'STOPPED',
        `Stopped after ${definition.maxSteps} steps, the limit for this report. The queries, ledger and notes so far are kept.`
      );
    }
    if (now().getTime() - startedAt.getTime() >= definition.maxMinutes * 60_000) {
      return end(
        'STOPPED',
        `Stopped after ${definition.maxMinutes} minutes, the limit for this report. The queries, ledger and notes so far are kept.`
      );
    }

    const called = await step();
    if (signals.attention) return end('NEEDS_ATTENTION', signals.attention.reason);

    idle = called === 0 ? idle + 1 : 0;
    if (idle >= MAX_IDLE_STEPS) {
      return end('NEEDS_ATTENTION', 'The model stopped working without finishing the report.');
    }
    if (called === 0) messages.push({ role: 'user', content: NUDGE });
  }

  // The recheck
  if (await interrupted()) return;
  await store.updateRun(runId, { status: 'RECHECKING' });
  await store.appendEvent(runId, 'status', 'Rechecking: running every saved query again', {
    status: 'RECHECKING',
  });
  const recheck = await recheckRun(runId, store, dataTools);
  signals.queriesClosed = true;
  const changed =
    recheck.changedQueries.length + recheck.changedFigures.length + recheck.changedDatasets.length;
  await store.appendEvent(
    runId,
    'status',
    changed === 0
      ? 'Recheck done: every query returned the same rows.'
      : `Recheck done: ${recheck.changedQueries.length} queries, ${recheck.changedFigures.length} figures and ${recheck.changedDatasets.length} datasets changed.`,
    recheck
  );

  // The correction turn
  if (changed > 0) {
    if (await interrupted()) return;
    await store.updateRun(runId, { status: 'RUNNING' });
    await store.appendEvent(runId, 'status', 'Revising after the recheck', { status: 'RUNNING' });
    signals.finish = undefined;
    messages.push({ role: 'user', content: correctionMessage(recheck) });
    for (let i = 0; i < CORRECTION_STEPS && !signals.finish; i++) {
      if (await interrupted()) return;
      const called = await step();
      if (signals.attention) return end('NEEDS_ATTENTION', signals.attention.reason);
      if (called === 0) break;
    }
  }

  if (await interrupted()) return;
  const typed = await lintRun(runId, store);
  if (typed > 0) {
    await store.appendEvent(
      runId,
      'warning',
      `${typed} number(s) typed into the wording match no figure in the ledger. They are listed under Warnings.`
    );
  }
  await end('COMPLETED', null);
}

/**
 * Check the wording of a run's blocks for typed numbers and store what is
 * found in the run's warnings, beside the warnings of other kinds. Returns
 * how many were found. It never fails a run.
 */
export async function lintRun(runId: string, store: ReportStore = prismaStore): Promise<number> {
  const run = await store.getRun(runId);
  if (!run) return 0;
  const [figures, datasets, defs, queries] = await Promise.all([
    store.listFigures(runId),
    store.listDatasets(runId),
    store.listBlockDefs(),
    store.listQueries(runId),
  ]);
  const prose = lintProse(
    runBlocks(run.blocks),
    runLedger(run, figures, datasets),
    defs.filter((def) => def.isCurrent),
    queries
  );
  await store.updateRun(runId, { warnings: withProseWarnings(run.warnings, prose) });
  return prose.length;
}

/**
 * Mark runs a restart left behind as stopped. The loop lives in the server's
 * process, so a run that is still active at server start has nobody driving
 * it. Its queries, ledger and notes are kept; it is not resumed.
 */
export async function stopInterruptedRuns(store: ReportStore = prismaStore): Promise<number> {
  let stopped = 0;
  for (let run = await store.findActiveRun(); run; run = await store.findActiveRun()) {
    const reason =
      'Stopped because the server restarted. The queries, ledger and notes so far are kept.';
    await store.updateRun(run.id, {
      status: 'STOPPED',
      statusReason: reason,
      completedAt: new Date(),
    });
    await store.appendEvent(run.id, 'status', reason, { status: 'STOPPED' });
    stopped++;
  }
  return stopped;
}
