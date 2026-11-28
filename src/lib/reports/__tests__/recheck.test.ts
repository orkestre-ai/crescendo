import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { recheckRun } from '../recheck';
import { memoryStore, type ReportStore } from '../store';
import type { ReportFigure } from '../types';

type Row = Record<string, string>;

const DAILY: Row[] = [
  { date: '20261119', transactions: '100', purchaseRevenue: '250.5' },
  { date: '20261120', transactions: '120', purchaseRevenue: '300' },
  { date: '20261121', transactions: '80', purchaseRevenue: '0' },
];

/** A data tool that answers with whatever the test has put in `answer`. */
function fakeTool(answer: { rows: Row[]; fail?: string }) {
  const calls: unknown[] = [];
  const fake = tool({
    description: 'A fake report',
    inputSchema: z.object({ metrics: z.array(z.string()) }),
    execute: async (params) => {
      calls.push(params);
      if (answer.fail) throw new Error(answer.fail);
      return {
        data: { headers: Object.keys(answer.rows[0] ?? {}), rows: answer.rows, sampled: false },
        summary: `${answer.rows.length} rows`,
      };
    },
  }) as Tool;
  return { fake, calls };
}

const figure = (store: ReportStore, runId: string, partial: Partial<ReportFigure>) =>
  store.upsertFigure({
    runId,
    key: 'figure',
    label: 'A figure',
    unit: 'count',
    value: null,
    text: null,
    display: '',
    source: { kind: 'stated', value: 0, reason: '' },
    queryKeys: [],
    recheckStatus: 'unchecked',
    previousValue: null,
    ...partial,
  });

/** A run with one saved query (q1 = DAILY) and a small ledger over it. */
async function seededRun() {
  const store = memoryStore();
  const run = await store.createRun({
    definitionId: null,
    definitionSnapshot: {
      key: 'test',
      name: 'Test',
      prompt: '',
      enabledTools: ['fake_report'],
      maxSteps: 10,
      maxMinutes: 10,
    },
    title: 'Test',
    preparedBy: null,
    inputs: {},
  });
  await store.updateRun(run.id, { currencyCode: 'CAD', timeZone: 'America/Toronto' });
  await store.saveQuery(run.id, {
    tool: 'fake_report',
    params: { metrics: ['transactions', 'purchaseRevenue'] },
    result: { headers: ['date', 'transactions', 'purchaseRevenue'], rows: DAILY, sampled: false },
    rowCount: 3,
    sampled: false,
    samplingNote: null,
  });

  await figure(store, run.id, {
    key: 'gifts',
    value: 300,
    display: '300',
    source: { kind: 'aggregate', query: 'q1', column: 'transactions', agg: 'sum' },
    queryKeys: ['q1'],
  });
  await figure(store, run.id, {
    key: 'revenue',
    unit: 'currency',
    value: 550.5,
    display: '$550.50',
    source: { kind: 'aggregate', query: 'q1', column: 'purchaseRevenue', agg: 'sum' },
    queryKeys: ['q1'],
  });
  await figure(store, run.id, {
    key: 'last_day',
    value: 80,
    display: '80',
    source: {
      kind: 'cell',
      query: 'q1',
      column: 'transactions',
      where: [{ column: 'date', op: '=', value: '20261121' }],
    },
    queryKeys: ['q1'],
  });
  await figure(store, run.id, {
    key: 'per_gift',
    unit: 'currency',
    value: 550.5 / 300,
    display: '$1.84',
    source: { kind: 'formula', expr: 'r / s', refs: { r: 'revenue', s: 'gifts' } },
    queryKeys: ['q1'],
  });
  await figure(store, run.id, {
    key: 'mailed',
    value: 5000,
    display: '5,000',
    source: { kind: 'stated', value: 5000, reason: 'From the mail house' },
    recheckStatus: 'stated',
  });
  await store.upsertDataset({
    runId: run.id,
    key: 'daily',
    label: 'Daily gifts',
    spec: { from: 'q1', select: [{ column: 'date' }, { column: 'transactions', format: 'count' }] },
    columns: [
      { key: 'date', format: 'text' },
      { key: 'transactions', format: 'count' },
    ],
    rows: [
      ['20261119', 100],
      ['20261120', 120],
      ['20261121', 80],
    ],
  });
  return { store, runId: run.id };
}

const byKey = async (store: ReportStore, runId: string) =>
  Object.fromEntries((await store.listFigures(runId)).map((f) => [f.key, f]));

test('recheckRun: the same rows the second time match every figure', async () => {
  const { store, runId } = await seededRun();
  const { fake, calls } = fakeTool({ rows: DAILY });

  const result = await recheckRun(runId, store, { fake_report: fake });

  assert.deepEqual(result, { changedQueries: [], changedFigures: [], changedDatasets: [] });
  // The query ran again with the params it was saved with.
  assert.deepEqual(calls, [{ metrics: ['transactions', 'purchaseRevenue'] }]);

  const figures = await byKey(store, runId);
  for (const key of ['gifts', 'revenue', 'last_day', 'per_gift']) {
    assert.equal(figures[key].recheckStatus, 'matched', key);
    assert.equal(figures[key].previousValue, null, key);
  }
  assert.equal(figures.gifts.value, 300);

  const query = await store.getQuery(runId, 'q1');
  assert.equal(query?.recheck?.matched, true);
  assert.equal(query?.recheck?.rowsBefore, 3);
  assert.equal(query?.recheck?.rowsAfter, 3);
  assert.deepEqual(query?.recheck?.removed, []);
  assert.deepEqual(query?.recheck?.added, []);
  assert.deepEqual((await store.getRun(runId))?.warnings, []);
});

test('recheckRun: rows in a different order still match, and nothing moves', async () => {
  const { store, runId } = await seededRun();
  const { fake } = fakeTool({ rows: [...DAILY].reverse() });

  const result = await recheckRun(runId, store, { fake_report: fake });

  assert.deepEqual(result, { changedQueries: [], changedFigures: [], changedDatasets: [] });
  // The first run's order is kept, so the table built from it is the same.
  const query = await store.getQuery(runId, 'q1');
  assert.equal(query?.recheck?.matched, true);
  assert.deepEqual((query?.result as { rows: Row[] }).rows, DAILY);
});

test('recheckRun: a number that changed corrects its figures and keeps the old value', async () => {
  const { store, runId } = await seededRun();
  // GA4 was still processing the last day: 80 gifts became 95.
  const second = DAILY.map((row) =>
    row.date === '20261121' ? { ...row, transactions: '95' } : row
  );
  const { fake } = fakeTool({ rows: second });

  const result = await recheckRun(runId, store, { fake_report: fake });

  assert.deepEqual(result.changedQueries, ['q1']);
  assert.deepEqual(result.changedDatasets, ['daily']);
  assert.deepEqual(result.changedFigures, [
    { key: 'gifts', before: 300, after: 315, beforeDisplay: '300', afterDisplay: '315' },
    { key: 'last_day', before: 80, after: 95, beforeDisplay: '80', afterDisplay: '95' },
    {
      key: 'per_gift',
      before: 550.5 / 300,
      after: 550.5 / 315,
      beforeDisplay: '$1.84',
      afterDisplay: '$1.75',
    },
  ]);

  const figures = await byKey(store, runId);
  assert.equal(figures.gifts.recheckStatus, 'corrected');
  assert.equal(figures.gifts.value, 315);
  assert.equal(figures.gifts.display, '315');
  assert.equal(figures.gifts.previousValue, 300);
  // The formula follows the figures it reads.
  assert.equal(figures.per_gift.recheckStatus, 'corrected');
  assert.equal(figures.per_gift.value, 550.5 / 315);
  assert.equal(figures.per_gift.previousValue, 550.5 / 300);
  // A figure the change did not touch still matches.
  assert.equal(figures.revenue.recheckStatus, 'matched');
  assert.equal(figures.revenue.value, 550.5);

  // The query now holds the second result, and says what differed.
  const query = await store.getQuery(runId, 'q1');
  assert.deepEqual((query?.result as { rows: Row[] }).rows, second);
  assert.equal(query?.recheck?.matched, false);
  assert.deepEqual(query?.recheck?.removed, [DAILY[2]]);
  assert.deepEqual(query?.recheck?.added, [second[2]]);

  const dataset = (await store.listDatasets(runId))[0];
  assert.deepEqual(dataset.rows[2], ['20261121', 95]);
});

test('recheckRun: the comparison is exact, with no tolerance', async () => {
  const { store, runId } = await seededRun();
  const second = DAILY.map((row) =>
    row.date === '20261119' ? { ...row, purchaseRevenue: '250.51' } : row
  );
  const { fake } = fakeTool({ rows: second });

  const result = await recheckRun(runId, store, { fake_report: fake });

  assert.deepEqual(
    result.changedFigures.map((f) => f.key),
    ['revenue', 'per_gift']
  );
  assert.equal((await byKey(store, runId)).revenue.value, 550.51);
});

test('recheckRun: floating-point noise in GA4 decimals is not a change', async () => {
  const { store, runId } = await seededRun();
  // Seen live: the same revenue came back with noise in the 11th decimal.
  const second = DAILY.map((row) =>
    row.date === '20261119' ? { ...row, purchaseRevenue: '250.50000000000003' } : row
  );
  const { fake } = fakeTool({ rows: second });

  const result = await recheckRun(runId, store, { fake_report: fake });

  assert.deepEqual(result, { changedQueries: [], changedFigures: [], changedDatasets: [] });
  assert.equal((await store.getQuery(runId, 'q1'))?.recheck?.matched, true);
  assert.equal((await byKey(store, runId)).revenue.recheckStatus, 'matched');
});

test('recheckRun: a stated figure stays stated', async () => {
  const { store, runId } = await seededRun();
  const { fake } = fakeTool({
    rows: [{ date: '20261119', transactions: '1', purchaseRevenue: '1' }],
  });

  await recheckRun(runId, store, { fake_report: fake });

  const mailed = (await byKey(store, runId)).mailed;
  assert.equal(mailed.recheckStatus, 'stated');
  assert.equal(mailed.value, 5000);
});

test('recheckRun: a query that cannot be run again leaves its figures unchecked, with a warning', async () => {
  const { store, runId } = await seededRun();
  const { fake } = fakeTool({ rows: [], fail: 'Quota exhausted' });

  const result = await recheckRun(runId, store, { fake_report: fake });

  assert.deepEqual(result, { changedQueries: [], changedFigures: [], changedDatasets: [] });
  const figures = await byKey(store, runId);
  for (const key of ['gifts', 'revenue', 'last_day', 'per_gift']) {
    assert.equal(figures[key].recheckStatus, 'unchecked', key);
  }
  assert.equal(figures.gifts.value, 300);

  // The first result is kept.
  const query = await store.getQuery(runId, 'q1');
  assert.deepEqual((query?.result as { rows: Row[] }).rows, DAILY);
  assert.equal(query?.recheck?.matched, false);
  assert.equal(query?.recheck?.error, 'Quota exhausted');

  const run = await store.getRun(runId);
  assert.equal(run?.warnings.length, 1);
  assert.equal(run!.warnings[0].kind, 'recheck');
  assert.match(run!.warnings[0].message, /Query q1 could not be run again.*Quota exhausted/);
  const warnings = (await store.listEvents(runId)).filter((e) => e.type === 'warning');
  assert.equal(warnings.length, 1);
});

test('recheckRun: a tool that no longer exists counts as a query that could not be run', async () => {
  const { store, runId } = await seededRun();
  await recheckRun(runId, store, {});
  const query = await store.getQuery(runId, 'q1');
  assert.match(query?.recheck?.error ?? '', /"fake_report" is no longer available/);
});

test('recheckRun: a figure whose row vanished is corrected to nothing, with a warning', async () => {
  const { store, runId } = await seededRun();
  const { fake } = fakeTool({ rows: DAILY.slice(0, 2) });

  const result = await recheckRun(runId, store, { fake_report: fake });

  const lastDay = (await byKey(store, runId)).last_day;
  assert.equal(lastDay.recheckStatus, 'corrected');
  assert.equal(lastDay.value, null);
  assert.equal(lastDay.display, '—');
  assert.equal(lastDay.previousValue, 80);
  assert.ok(result.changedFigures.some((f) => f.key === 'last_day' && f.after === null));
  assert.match(
    (await store.getRun(runId))!.warnings[0].message,
    /Figure last_day could not be recomputed/
  );
});

test('recheckRun: a text figure that changed is corrected', async () => {
  const { store, runId } = await seededRun();
  await figure(store, runId, {
    key: 'best_day',
    unit: 'text',
    text: '20261120',
    display: '20261120',
    source: {
      kind: 'cell',
      query: 'q1',
      column: 'date',
      where: [{ column: 'transactions', op: '>=', value: '110' }],
    },
    queryKeys: ['q1'],
  });
  const second = [
    { date: '20261119', transactions: '130', purchaseRevenue: '250.5' },
    { date: '20261120', transactions: '90', purchaseRevenue: '300' },
    { date: '20261121', transactions: '80', purchaseRevenue: '0' },
  ];
  const { fake } = fakeTool({ rows: second });

  const result = await recheckRun(runId, store, { fake_report: fake });

  const best = (await byKey(store, runId)).best_day;
  assert.equal(best.recheckStatus, 'corrected');
  assert.equal(best.text, '20261119');
  assert.deepEqual(
    result.changedFigures.find((f) => f.key === 'best_day'),
    {
      key: 'best_day',
      before: null,
      after: null,
      beforeDisplay: '20261120',
      afterDisplay: '20261119',
    }
  );
});

test('recheckRun: formulas are recomputed after the figures they read, whatever order they were recorded in', async () => {
  const { store, runId } = await seededRun();
  // Recorded before the figure it reads exists in the list order.
  const figures = await store.listFigures(runId);
  const reordered = memoryStore();
  const run = await reordered.createRun({
    definitionId: null,
    definitionSnapshot: (await store.getRun(runId))!.definitionSnapshot,
    title: 'Test',
    preparedBy: null,
    inputs: {},
  });
  await reordered.saveQuery(run.id, (await store.getQuery(runId, 'q1'))!);
  for (const f of [...figures].reverse()) await reordered.upsertFigure({ ...f, runId: run.id });
  await figure(reordered, run.id, {
    key: 'double',
    unit: 'currency',
    value: (550.5 / 300) * 2,
    display: '$3.67',
    source: { kind: 'formula', expr: 'p * 2', refs: { p: 'per_gift' } },
    queryKeys: ['q1'],
  });

  const second = DAILY.map((row) =>
    row.date === '20261121' ? { ...row, transactions: '95' } : row
  );
  const { fake } = fakeTool({ rows: second });
  await recheckRun(run.id, reordered, { fake_report: fake });

  const after = await byKey(reordered, run.id);
  assert.equal(after.per_gift.value, 550.5 / 315);
  assert.equal(after.double.value, (550.5 / 315) * 2);
  assert.equal(after.double.recheckStatus, 'corrected');
});

test('recheckRun: email addresses in the second result are removed before it is stored', async () => {
  const { store, runId } = await seededRun();
  const second = DAILY.map((row, i) => (i === 0 ? { ...row, date: 'jane@example.org' } : row));
  const { fake } = fakeTool({ rows: second });

  await recheckRun(runId, store, { fake_report: fake });

  const query = await store.getQuery(runId, 'q1');
  assert.equal((query?.result as { rows: Row[] }).rows[0].date, '[email removed]');
});
