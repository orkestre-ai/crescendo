import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tool, type Tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import {
  CORRECTION_STEPS,
  ReportBusyError,
  ReportDefinitionNotFoundError,
  runReport,
  startReportRun,
  stopInterruptedRuns,
  type RunDeps,
} from '../runner';
import { memoryStore, type ReportStore } from '../store';
import type { DefinitionSnapshot, ReportDefinition } from '../types';

type Row = Record<string, string>;
type Call = { tool: string; input: unknown };
/** One model step: the tools it calls, or nothing but text. */
type Step = Call[] | string;

const DAILY: Row[] = [
  { date: '20261123', transactions: '100', purchaseRevenue: '250.5' },
  { date: '20261124', transactions: '120', purchaseRevenue: '300' },
  { date: '20261125', transactions: '80', purchaseRevenue: '0' },
];

const DEFINITION: DefinitionSnapshot = {
  key: 'test',
  name: 'Test report',
  prompt: 'Report on {{campaign}} as of {{today}}, in {{currency}}.',
  enabledTools: ['fake_report'],
  maxSteps: 50,
  maxMinutes: 60,
};

const PROPERTY = async () => ({ timeZone: 'America/Toronto', currencyCode: 'CAD' });
// Noon in Toronto on 26 November 2026.
const NOON = new Date('2026-11-26T17:00:00Z');

/**
 * A model that plays a script, one entry per step. An entry may be a function
 * of the step number, for scripts that go on for ever.
 */
function scriptedModel(script: Step[] | ((step: number) => Step)) {
  let n = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const step = typeof script === 'function' ? script(n) : (script[n] ?? 'Nothing more to do.');
      n++;
      const calls = typeof step === 'string' ? [] : step;
      return {
        content:
          typeof step === 'string'
            ? [{ type: 'text' as const, text: step }]
            : calls.map((call, i) => ({
                type: 'tool-call' as const,
                toolCallId: `call-${n}-${i}`,
                toolName: call.tool,
                input: JSON.stringify(call.input),
              })),
        finishReason: {
          unified: calls.length ? ('tool-calls' as const) : ('stop' as const),
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 1000, noCache: 100, cacheRead: 900, cacheWrite: 0 },
          outputTokens: { total: 50, text: 50, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

/**
 * A data tool whose answers the test controls: the nth call gets the nth
 * entry of `answers`, and the last entry from then on.
 */
function fakeReport(answers: Row[][]) {
  const calls: unknown[] = [];
  const fake = tool({
    description: 'A fake report',
    inputSchema: z.object({ metrics: z.array(z.string()) }),
    execute: async (params) => {
      const rows = answers[Math.min(calls.length, answers.length - 1)];
      calls.push(params);
      return {
        data: { headers: Object.keys(rows[0] ?? {}), rows, sampled: false },
        summary: `${rows.length} rows`,
      };
    },
  }) as Tool;
  return { fake, calls };
}

const QUERY: Call = {
  tool: 'fake_report',
  input: { metrics: ['transactions', 'purchaseRevenue'] },
};
const FIGURES: Call[] = [
  {
    tool: 'record_figure',
    input: {
      key: 'gifts',
      label: 'Gifts',
      unit: 'count',
      source: { kind: 'aggregate', query: 'q1', column: 'transactions', agg: 'sum' },
    },
  },
  {
    tool: 'record_figure',
    input: {
      key: 'revenue',
      label: 'Revenue',
      unit: 'currency',
      source: { kind: 'aggregate', query: 'q1', column: 'purchaseRevenue', agg: 'sum' },
    },
  },
  {
    tool: 'record_figure',
    input: {
      key: 'last_day',
      label: 'Gifts on the last day',
      unit: 'count',
      source: {
        kind: 'cell',
        query: 'q1',
        column: 'transactions',
        where: [{ column: 'date', op: '=', value: '20261125' }],
      },
    },
  },
  {
    // Reads two figures recorded in the same step.
    tool: 'record_figure',
    input: {
      key: 'per_gift',
      label: 'Average gift',
      unit: 'currency',
      source: { kind: 'formula', expr: 'r / s', refs: { r: 'revenue', s: 'gifts' } },
    },
  },
];
const FINISH: Call = { tool: 'finish_report', input: { summary: 'Three days reported.' } };
const STARTING_BLOCK = {
  id: 'b1',
  block: 'prose',
  version: 1,
  data: { paragraphs: ['Three days were reported.'] },
};

async function start(
  store: ReportStore,
  script: Step[] | ((step: number) => Step),
  opts: { answers?: Row[][]; definition?: Partial<DefinitionSnapshot>; deps?: RunDeps } = {}
) {
  const { fake, calls } = fakeReport(opts.answers ?? [DAILY]);
  const model = scriptedModel(script);
  const { runId } = await startReportRun(
    {
      definition: { ...DEFINITION, ...opts.definition },
      inputs: { campaign: 'Year-end' },
      preparedBy: 'Ryan',
    },
    { store }
  );
  // finish_report is refused while a report has no blocks. These tests are
  // about the loop, so the run starts with one; blocks-render.test.ts covers
  // the block tools and the refusal.
  await store.updateRun(runId, { blocks: [STARTING_BLOCK] });
  const deps: RunDeps = {
    store,
    model,
    now: () => NOON,
    tools: { fake_report: fake },
    property: PROPERTY,
    maxContext: 1_000_000,
    ...opts.deps,
  };
  return { runId, model, deps, dataCalls: calls };
}

const figuresByKey = async (store: ReportStore, runId: string) =>
  Object.fromEntries((await store.listFigures(runId)).map((f) => [f.key, f]));

/** Everything the model was sent on a call, as one string. */
const sent = (model: MockLanguageModelV3, call: number) =>
  JSON.stringify(model.doGenerateCalls[call].prompt);

// --- a whole run ---

test('runReport: a scripted run saves its query, computes its figures and finishes rechecked', async () => {
  const store = memoryStore();
  const { runId, model, deps, dataCalls } = await start(store, [
    [QUERY],
    FIGURES,
    [{ tool: 'note', input: { text: 'Revenue was flat on the last day.' } }],
    [FINISH],
  ]);

  assert.equal((await store.getRun(runId))?.status, 'QUEUED');
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.statusReason, null);
  assert.equal(run.title, 'Test report');
  assert.equal(run.preparedBy, 'Ryan');
  assert.equal(run.timeZone, 'America/Toronto');
  assert.equal(run.currencyCode, 'CAD');
  assert.equal(run.stepCount, 4);
  assert.deepEqual(run.startedAt, NOON);
  assert.deepEqual(run.completedAt, NOON);
  // Tokens: fresh input, cached input and output, added up over the steps.
  assert.deepEqual(run.usage, {
    inputTokens: 400,
    cachedInputTokens: 3600,
    outputTokens: 200,
    steps: 4,
  });

  // The query was saved with its params and result, and ran a second time.
  const queries = await store.listQueries(runId);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].key, 'q1');
  assert.equal(queries[0].tool, 'fake_report');
  assert.deepEqual(queries[0].params, { metrics: ['transactions', 'purchaseRevenue'] });
  assert.equal(queries[0].rowCount, 3);
  assert.equal(queries[0].recheck?.matched, true);
  assert.equal(dataCalls.length, 2);

  // Crescendo computed and formatted every figure, and every one was rechecked.
  const figures = await figuresByKey(store, runId);
  assert.equal(figures.gifts.value, 300);
  assert.equal(figures.gifts.display, '300');
  assert.equal(figures.revenue.value, 550.5);
  assert.equal(figures.revenue.display, '$550.50');
  assert.equal(figures.last_day.value, 80);
  assert.equal(figures.per_gift.value, 550.5 / 300);
  assert.equal(figures.per_gift.display, '$1.84');
  assert.deepEqual(figures.per_gift.queryKeys, ['q1']);
  for (const figure of Object.values(figures)) {
    assert.equal(figure.recheckStatus, 'matched', figure.key);
  }

  // No correction turn: nothing changed, so the model was called four times.
  assert.equal(model.doGenerateCalls.length, 4);

  // The activity log, in order.
  const events = await store.listEvents(runId);
  assert.deepEqual(
    events.map((e) => e.seq),
    events.map((_, i) => i + 1)
  );
  assert.deepEqual(
    events.map((e) => `${e.type}: ${e.message}`),
    [
      'status: Queued',
      'status: Running',
      'query: q1: fake_report, 3 rows',
      'figure: gifts = 300 (Gifts)',
      'figure: revenue = $550.50 (Revenue)',
      'figure: last_day = 80 (Gifts on the last day)',
      'figure: per_gift = $1.84 (Average gift)',
      'note: Revenue was flat on the last day.',
      'summary: Three days reported.',
      'status: Rechecking: running every saved query again',
      'status: Recheck done: every query returned the same rows.',
      'status: Completed',
    ]
  );
  assert.deepEqual(await store.listEvents(runId, 10), events.slice(10));
});

test('runReport: the model is told the date, the ledger rules and the definition with its inputs filled in', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [[FINISH]]);
  await runReport(runId, deps);

  const first = sent(model, 0);
  // Today in the property's time zone, and the last full day.
  assert.match(first, /Today is 2026-11-26 in the property's time zone \(America\/Toronto\)/);
  assert.match(first, /The last full day is 2026-11-25/);
  assert.match(first, /Never type a number you worked out yourself/);
  assert.match(first, /End every date range at yesterday or earlier/);
  assert.match(first, /Report on Year-end as of 2026-11-26, in CAD\./);

  // The report tools are always there, beside the definition's data tool.
  const names = (model.doGenerateCalls[0].tools ?? []).map((t) => t.name).sort();
  assert.deepEqual(names, [
    'add_block',
    'define_dataset',
    'fake_report',
    'finish_report',
    'list_blocks',
    'needs_attention',
    'note',
    'read_query',
    'record_figure',
    'remove_block',
    'update_block',
  ]);
});

test('runReport: the date is the property’s, not the server’s', async () => {
  const store = memoryStore();
  // 03:00 UTC on the 27th is still the evening of the 26th in Toronto.
  const { runId, model, deps } = await start(store, [[FINISH]], {
    deps: { now: () => new Date('2026-11-27T03:00:00Z') },
  });
  await runReport(runId, deps);
  assert.match(sent(model, 0), /Today is 2026-11-26 .*The last full day is 2026-11-25/);
});

test('runReport: the model reads each computed value back from the tool', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [
    [QUERY],
    FIGURES,
    [
      {
        tool: 'define_dataset',
        input: {
          key: 'daily',
          label: 'Gifts by day',
          spec: {
            from: 'q1',
            select: [{ column: 'date' }, { column: 'transactions', format: 'count' }],
            totalRow: true,
          },
        },
      },
      { tool: 'read_query', input: { query: 'q1', offset: 1, limit: 1 } },
    ],
    [FINISH],
  ]);
  await runReport(runId, deps);

  // Step 2 sees the query result with its key.
  assert.match(sent(model, 1), /"query":"q1"/);
  // Step 3 sees the figures as Crescendo computed and wrote them.
  const third = sent(model, 2);
  assert.match(third, /"key":"gifts","value":300,"display":"300","rowsRead":3/);
  assert.match(third, /"key":"revenue","value":550.5,"display":"\$550.50"/);
  // Step 4 sees the dataset and the rows read back.
  const fourth = sent(model, 3);
  assert.match(fourth, /"rowCount":4/);
  assert.match(fourth, /\["Total",300\]/);
  assert.match(fourth, /"offset":1,"rows":\[\{"date":"20261124"/);

  const dataset = (await store.listDatasets(runId))[0];
  assert.deepEqual(dataset.rows[3], ['Total', 300]);
});

test('runReport: a call the ledger refuses goes back to the model as an error, and the run carries on', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [
    [QUERY],
    [
      {
        tool: 'record_figure',
        input: {
          key: 'one_day',
          label: 'One day',
          unit: 'count',
          source: { kind: 'cell', query: 'q1', column: 'transactions', where: [] },
        },
      },
      {
        tool: 'record_figure',
        input: {
          key: 'Bad Key',
          label: 'A key that will not do',
          unit: 'count',
          source: { kind: 'stated', value: 1, reason: 'test' },
        },
      },
    ],
    [FINISH],
  ]);
  await runReport(runId, deps);

  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
  assert.deepEqual(await store.listFigures(runId), []);
  assert.match(
    sent(model, 2),
    /A cell must match exactly one row; this one matched 3 of the 3 rows/
  );
  const errors = (await store.listEvents(runId)).filter((e) => e.type === 'tool_error');
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /^record_figure: A cell must match exactly one row/);
  assert.match(errors[1].message, /"Bad Key" cannot be a figure key/);
});

test('runReport: a stated figure is stored as stated and survives the recheck as such', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [
    [
      {
        tool: 'record_figure',
        input: {
          key: 'mailed',
          label: 'Letters mailed',
          unit: 'count',
          source: { kind: 'stated', value: 5000, reason: 'From the mail house, not in GA4' },
        },
      },
    ],
    [FINISH],
  ]);
  await runReport(runId, deps);

  const mailed = (await figuresByKey(store, runId)).mailed;
  assert.equal(mailed.recheckStatus, 'stated');
  assert.equal(mailed.display, '5,000');
  assert.match(sent(model, 1), /not machine-checked/);
});

test('runReport: recording a figure again updates the formulas that read it', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [
    [QUERY],
    FIGURES,
    [
      {
        tool: 'record_figure',
        input: {
          key: 'gifts',
          label: 'Gifts on the first two days',
          unit: 'count',
          source: {
            kind: 'aggregate',
            query: 'q1',
            column: 'transactions',
            agg: 'sum',
            where: [{ column: 'date', op: '<=', value: '20261124' }],
          },
        },
      },
    ],
    [FINISH],
  ]);
  await runReport(runId, deps);

  const figures = await figuresByKey(store, runId);
  assert.equal(figures.gifts.value, 220);
  assert.equal(figures.per_gift.value, 550.5 / 220);
  assert.match(sent(model, 3), /"alsoUpdated":\[\{"key":"per_gift","display":"\$2.50"\}\]/);
  // Both are consistent at the recheck, so neither reads as corrected.
  assert.equal(figures.per_gift.recheckStatus, 'matched');
});

test('runReport: email addresses are removed from a result before it is saved or shown, and counted', async () => {
  const store = memoryStore();
  const rows = [
    { pagePath: '/thanks?email=jane%40example.org', sessions: '3' },
    { pagePath: '/donate', sessions: '9' },
  ];
  const { runId, model, deps } = await start(store, [[QUERY], [FINISH]], { answers: [rows] });
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.redactedEmailCount, 1);
  const saved = (await store.getQuery(runId, 'q1'))!.result as { rows: Row[] };
  assert.equal(saved.rows[0].pagePath, '/thanks?email=[email removed]');
  assert.doesNotMatch(sent(model, 1), /jane/);
});

// --- guards ---

test('runReport: cancel mid-run stops before the next step and keeps the work so far', async () => {
  const store = memoryStore();
  let runId = '';
  const script = (step: number): Step => {
    // The person presses Cancel while step 3 is in progress.
    if (step === 2) void store.updateRun(runId, { cancelRequested: true });
    return step === 0
      ? [QUERY]
      : step === 1
        ? FIGURES
        : [{ tool: 'note', input: { text: `Step ${step + 1}` } }];
  };
  const started = await start(store, script);
  runId = started.runId;
  await runReport(runId, started.deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'CANCELLED');
  assert.match(run.statusReason ?? '', /Cancelled/);
  // The step in progress finished; no step ran after it.
  assert.equal(run.stepCount, 3);
  assert.equal(started.model.doGenerateCalls.length, 3);
  // Queries, ledger and notes are kept, and nothing was rechecked.
  assert.equal((await store.listQueries(runId)).length, 1);
  assert.equal((await store.listFigures(runId)).length, 4);
  assert.equal((await figuresByKey(store, runId)).gifts.recheckStatus, 'unchecked');
  assert.equal(started.dataCalls.length, 1);
  const events = await store.listEvents(runId);
  assert.ok(events.some((e) => e.type === 'note' && e.message === 'Step 3'));
  assert.equal(events.at(-1)?.type, 'status');
});

test('runReport: the step guard stops a run that never finishes', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(
    store,
    (step) => [{ tool: 'note', input: { text: `Still going, step ${step + 1}` } }],
    { definition: { maxSteps: 5 } }
  );
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'STOPPED');
  assert.match(run.statusReason ?? '', /Stopped after 5 steps, the limit for this report/);
  assert.equal(run.stepCount, 5);
  assert.equal(model.doGenerateCalls.length, 5);
  assert.equal((await store.listEvents(runId)).filter((e) => e.type === 'note').length, 5);
});

test('runReport: the time guard stops a run that takes too long', async () => {
  const store = memoryStore();
  // Each look at the clock is 10 minutes after the last.
  let minutes = 0;
  const now = () => new Date(NOON.getTime() + (minutes += 10) * 60_000);
  const { runId, model, deps } = await start(
    store,
    () => [{ tool: 'note', input: { text: 'Still going' } }],
    { definition: { maxMinutes: 30 }, deps: { now } }
  );
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'STOPPED');
  assert.match(run.statusReason ?? '', /Stopped after 30 minutes, the limit for this report/);
  assert.ok(model.doGenerateCalls.length < 5);
});

test('runReport: needs_attention ends the run with the model’s reason', async () => {
  const store = memoryStore();
  const { runId, model, deps, dataCalls } = await start(store, [
    [QUERY],
    [
      {
        tool: 'needs_attention',
        input: { reason: 'No donation event has fired since 12 November.' },
      },
    ],
    [FINISH],
  ]);
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'NEEDS_ATTENTION');
  assert.equal(run.statusReason, 'No donation event has fired since 12 November.');
  // It ended there: no further step and no recheck.
  assert.equal(model.doGenerateCalls.length, 2);
  assert.equal(dataCalls.length, 1);
  assert.equal((await store.listQueries(runId)).length, 1);
});

test('runReport: a model that stops calling tools is nudged, then the run asks for attention', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, () => 'I think that is everything.');
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'NEEDS_ATTENTION');
  assert.match(run.statusReason ?? '', /stopped working without finishing/);
  assert.equal(model.doGenerateCalls.length, 3);
  assert.match(sent(model, 1), /When the report is complete call finish_report/);
});

test('runReport: one quiet step does not end a run that then carries on', async () => {
  const store = memoryStore();
  const { runId, deps } = await start(store, ['Let me think.', [QUERY], 'Hmm.', [FINISH]]);
  await runReport(runId, deps);
  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
});

test('runReport: an error from the model ends the run as failed, with the reason', async () => {
  const store = memoryStore();
  const { runId, deps } = await start(store, [[QUERY]]);
  let calls = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      if (calls++ === 0) return (await scriptedModel([[QUERY]]).doGenerate({} as never))!;
      throw new Error('The provider is overloaded');
    },
  });
  await runReport(runId, { ...deps, model });

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'FAILED');
  assert.match(run.statusReason ?? '', /The provider is overloaded/);
  // What was saved before the failure is kept.
  assert.equal((await store.listQueries(runId)).length, 1);
});

test('runReport: a property that cannot be read fails the run before any model call', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [[FINISH]], {
    deps: {
      property: async () => {
        throw new Error('GA4 is not configured');
      },
    },
  });
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'FAILED');
  assert.equal(run.statusReason, 'GA4 is not configured');
  assert.equal(model.doGenerateCalls.length, 0);
});

test('runReport: a run that is not queued is left alone', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [[FINISH]]);
  await runReport(runId, deps);
  await runReport(runId, deps);
  assert.equal(model.doGenerateCalls.length, 1);
  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
});

test('runReport: a tool the definition names that does not exist is skipped with a warning', async () => {
  const store = memoryStore();
  const { runId, model, deps } = await start(store, [[FINISH]], {
    definition: { enabledTools: ['fake_report', 'google_ads'] },
  });
  await runReport(runId, deps);

  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
  const names = (model.doGenerateCalls[0].tools ?? []).map((t) => t.name);
  assert.ok(!names.includes('google_ads'));
  const warnings = (await store.listEvents(runId)).filter((e) => e.type === 'warning');
  assert.match(warnings[0].message, /"google_ads" does not exist/);
});

// --- recheck and correction ---

test('runReport: a different number the second time corrects the figure and gives the model a correction turn', async () => {
  const store = memoryStore();
  // The last day was still being processed: 80 gifts on the first run, 95 on the second.
  const second = DAILY.map((row) =>
    row.date === '20261125' ? { ...row, transactions: '95' } : row
  );
  const { runId, model, deps, dataCalls } = await start(
    store,
    [
      [QUERY],
      FIGURES,
      [FINISH],
      // The correction turn
      [{ tool: 'note', input: { text: 'Gifts were revised up after the recheck.' } }],
      [{ tool: 'finish_report', input: { summary: 'Three days reported, one figure revised.' } }],
    ],
    { answers: [DAILY, second] }
  );
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.stepCount, 5);
  assert.equal(dataCalls.length, 2);

  const figures = await figuresByKey(store, runId);
  assert.equal(figures.gifts.recheckStatus, 'corrected');
  assert.equal(figures.gifts.value, 315);
  assert.equal(figures.gifts.display, '315');
  assert.equal(figures.gifts.previousValue, 300);
  assert.equal(figures.last_day.recheckStatus, 'corrected');
  assert.equal(figures.last_day.value, 95);
  assert.equal(figures.last_day.previousValue, 80);
  assert.equal(figures.per_gift.recheckStatus, 'corrected');
  assert.equal(figures.per_gift.value, 550.5 / 315);
  assert.equal(figures.revenue.recheckStatus, 'matched');
  assert.equal(figures.revenue.previousValue, null);

  // The model got its correction turn: old and new values, by figure.
  const correction = sent(model, 3);
  assert.match(correction, /gifts: was 300, is now 315/);
  assert.match(correction, /last_day: was 80, is now 95/);
  assert.match(correction, /per_gift: was \$1\.84, is now \$1\.75/);
  assert.doesNotMatch(correction, /- revenue: was/);
  assert.match(correction, /Queries whose rows changed: q1/);

  const messages = (await store.listEvents(runId)).map((e) => `${e.type}: ${e.message}`);
  assert.deepEqual(messages.slice(-6), [
    'status: Rechecking: running every saved query again',
    'status: Recheck done: 1 queries, 3 figures and 0 datasets changed.',
    'status: Revising after the recheck',
    'note: Gifts were revised up after the recheck.',
    'summary: Three days reported, one figure revised.',
    'status: Completed',
  ]);
  // The run is not rechecked a second time.
  assert.equal(messages.filter((m) => m.startsWith('status: Rechecking')).length, 1);
});

test('runReport: no new queries can be run in the correction turn', async () => {
  const store = memoryStore();
  const second = DAILY.map((row) =>
    row.date === '20261125' ? { ...row, transactions: '95' } : row
  );
  const { runId, model, deps, dataCalls } = await start(
    store,
    [[QUERY], FIGURES, [FINISH], [QUERY], [FINISH]],
    { answers: [DAILY, second] }
  );
  await runReport(runId, deps);

  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
  // First run and recheck only: the third call was refused.
  assert.equal(dataCalls.length, 2);
  assert.equal((await store.listQueries(runId)).length, 1);
  assert.match(sent(model, 4), /have been rechecked and no new ones can be run/);
});

test('runReport: the correction turn ends after 20 steps', async () => {
  const store = memoryStore();
  const second = DAILY.map((row) =>
    row.date === '20261125' ? { ...row, transactions: '95' } : row
  );
  const { runId, model, deps } = await start(
    store,
    (step) =>
      step === 0
        ? [QUERY]
        : step === 1
          ? FIGURES
          : step === 2
            ? [FINISH]
            : [{ tool: 'note', input: { text: 'Still revising' } }],
    { answers: [DAILY, second] }
  );
  await runReport(runId, deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'COMPLETED');
  assert.equal(model.doGenerateCalls.length, 3 + CORRECTION_STEPS);
  assert.equal(run.stepCount, 3 + CORRECTION_STEPS);
});

test('runReport: the correction turn ends when the model has nothing more to do', async () => {
  const store = memoryStore();
  const second = DAILY.map((row) =>
    row.date === '20261125' ? { ...row, transactions: '95' } : row
  );
  const { runId, model, deps } = await start(
    store,
    [[QUERY], FIGURES, [FINISH], 'Nothing needs revising.'],
    { answers: [DAILY, second] }
  );
  await runReport(runId, deps);
  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
  assert.equal(model.doGenerateCalls.length, 4);
});

test('runReport: cancel during the correction turn is honoured', async () => {
  const store = memoryStore();
  const second = DAILY.map((row) =>
    row.date === '20261125' ? { ...row, transactions: '95' } : row
  );
  let runId = '';
  const script = (step: number): Step => {
    if (step === 3) void store.updateRun(runId, { cancelRequested: true });
    return step === 0
      ? [QUERY]
      : step === 1
        ? FIGURES
        : step === 2
          ? [FINISH]
          : [{ tool: 'note', input: { text: 'Revising' } }];
  };
  const started = await start(store, script, { answers: [DAILY, second] });
  runId = started.runId;
  await runReport(runId, started.deps);

  assert.equal((await store.getRun(runId))?.status, 'CANCELLED');
  assert.equal(started.model.doGenerateCalls.length, 4);
  // The corrected ledger is kept.
  assert.equal((await figuresByKey(store, runId)).gifts.value, 315);
});

// --- context clearing in the loop ---

test('runReport: past the cap, old results are cleared from the working messages but stay readable', async () => {
  const store = memoryStore();
  const big = Array.from({ length: 60 }, (_, i) => ({
    date: `2026${String(i + 1000)}`,
    sessions: String(i),
    purchaseRevenue: '1',
  }));
  const script: Step[] = [
    ...Array.from({ length: 9 }, () => [QUERY]),
    [{ tool: 'read_query', input: { query: 'q1', limit: 2 } }],
    [FINISH],
  ];
  const { runId, model, deps } = await start(store, script, {
    answers: [big],
    deps: { maxContext: 9000 },
  });
  await runReport(runId, deps);

  assert.equal((await store.getRun(runId))?.status, 'COMPLETED');
  const cleared = (await store.listEvents(runId)).filter((e) =>
    /^Cleared \d+ old query/.test(e.message)
  );
  assert.ok(cleared.length >= 1, 'a clear was logged');

  // By the last call the first result is a stub; the newest results are whole.
  const last = sent(model, model.doGenerateCalls.length - 1);
  assert.match(
    last,
    /Cleared to save space: query q1, 60 rows, columns: date, sessions, purchaseRevenue/
  );
  assert.match(last, /"query":"q9"/);
  // The first message is never cleared.
  assert.match(last, /Today is 2026-11-26/);
  // The rows are still in the store, and read_query returned them.
  assert.equal((await store.getQuery(runId, 'q1'))?.rowCount, 60);
  assert.match(last, /"offset":0,"rows":\[\{"date":"20261000"/);
});

// --- starting ---

test('startReportRun: one run at a time', async () => {
  const store = memoryStore();
  const first = await start(store, [[FINISH]]);

  await assert.rejects(
    () => startReportRun({ definition: DEFINITION, inputs: {} }, { store }),
    (err: unknown) => err instanceof ReportBusyError && err.runId === first.runId
  );

  // Still busy while it runs and rechecks; free once it has ended.
  await runReport(first.runId, first.deps);
  const second = await startReportRun({ definition: DEFINITION, inputs: {} }, { store });
  assert.notEqual(second.runId, first.runId);
});

test('startReportRun: a run copies its definition, so later edits do not change it', async () => {
  const definition: ReportDefinition = {
    ...DEFINITION,
    id: 'def1',
    description: 'A test',
    inputs: [],
    isDefault: false,
    enabled: true,
    sortOrder: 0,
    scheduleDailyAt: null,
  };
  const store = memoryStore({ definitions: [definition] });
  const { runId } = await startReportRun(
    { definitionId: 'def1', inputs: { campaign: 'Spring' } },
    { store }
  );

  const run = (await store.getRun(runId))!;
  assert.equal(run.definitionId, 'def1');
  assert.deepEqual(run.definitionSnapshot, DEFINITION);
  assert.deepEqual(run.inputs, { campaign: 'Spring' });
  assert.equal(run.title, 'Test report');
  assert.equal(run.status, 'QUEUED');
});

test('startReportRun: an unknown definition, or none, is refused', async () => {
  const store = memoryStore();
  await assert.rejects(
    () => startReportRun({ definitionId: 'nope', inputs: {} }, { store }),
    ReportDefinitionNotFoundError
  );
  await assert.rejects(
    () => startReportRun({ inputs: {} }, { store }),
    /Give a definitionId or a definition/
  );
});

test('stopInterruptedRuns: a run left active by a restart is marked stopped, and a new one can start', async () => {
  const store = memoryStore();
  const { runId } = await startReportRun({ definition: DEFINITION, inputs: {} }, { store });
  await store.updateRun(runId, { status: 'RECHECKING' });

  assert.equal(await stopInterruptedRuns(store), 1);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'STOPPED');
  assert.match(run.statusReason ?? '', /the server restarted/);
  assert.equal(await stopInterruptedRuns(store), 0);
  await assert.doesNotReject(() =>
    startReportRun({ definition: DEFINITION, inputs: {} }, { store })
  );
});

test('runReport: a run ended from outside stops quietly without overwriting the status', async () => {
  const store = memoryStore();
  let runId = '';
  const script = (step: number): Step => {
    // The server restart marker fires while step 2 is in progress.
    if (step === 1) void stopInterruptedRuns(store);
    return [{ tool: 'note', input: { text: 'Working' } }];
  };
  const started = await start(store, script);
  runId = started.runId;
  await runReport(runId, started.deps);

  const run = (await store.getRun(runId))!;
  assert.equal(run.status, 'STOPPED');
  assert.match(run.statusReason ?? '', /the server restarted/);
  assert.equal(started.model.doGenerateCalls.length, 2);
});
