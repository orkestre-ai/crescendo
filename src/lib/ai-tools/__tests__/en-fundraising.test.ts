import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enFundraisingInputSchema,
  runEnFundraising,
  type EnFundraisingStore,
  type EnGivingRow,
} from '../en-fundraising';
import { RelativeDateError } from '../ga4-report';
import { computeFigure, queryTable } from '@/lib/reports/ledger';

function day(
  date: string,
  enPageId: string,
  totalAmount: number,
  donationCount: number,
  recurringAmount = 0
): EnGivingRow {
  return {
    date,
    enPageId,
    pageName: `Page ${enPageId}`,
    currency: 'CAD',
    totalAmount,
    donationCount,
    singleAmount: totalAmount - recurringAmount,
    singleCount: recurringAmount ? donationCount - 1 : donationCount,
    recurringAmount,
    recurringCount: recurringAmount ? 1 : 0,
  };
}

// Stored days: 1 and 2 December 2025 fetched for both pages, 3 December not
// fetched at all. Zero rows mean fetched with nothing in.
const STORED: EnGivingRow[] = [
  day('2025-12-01', '100', 120.1, 2, 20),
  day('2025-12-01', '200', 0, 0),
  day('2025-12-02', '100', 0.2, 1),
  day('2025-12-02', '200', 500, 4, 100),
  day('2024-12-03', '100', 0, 0),
  day('2024-12-03', '200', 300, 3),
];

/** The same answers the database store gives, from an array. */
function memoryStore(rows: EnGivingRow[] = STORED) {
  const asked: (string[] | undefined)[] = [];
  const inRange = (start: string, end: string, pages?: string[]) =>
    rows.filter(
      (row) => row.date >= start && row.date <= end && (!pages || pages.includes(row.enPageId))
    );
  const store: EnFundraisingStore = {
    async givingRows(start, end, pages) {
      asked.push(pages);
      return inRange(start, end, pages).filter((row) => row.donationCount || row.totalAmount);
    },
    async fetchedDays(start, end, pages) {
      const seen = new Map<string, { date: string; currency: string }>();
      for (const row of inRange(start, end, pages)) {
        seen.set(`${row.date}|${row.currency}`, { date: row.date, currency: row.currency });
      }
      return [...seen.values()];
    },
  };
  return { store, asked };
}

const DEC = { startDate: '2025-12-01', endDate: '2025-12-03' };

test('runEnFundraising: no dimensions gives one total row, in string cells', async () => {
  const result = await runEnFundraising({ dateRanges: [DEC] }, memoryStore().store);
  assert.deepEqual(result.headers, [
    'totalAmount',
    'donationCount',
    'singleAmount',
    'singleCount',
    'recurringAmount',
    'recurringCount',
  ]);
  assert.deepEqual(result.rows, [
    {
      totalAmount: '620.3',
      donationCount: '7',
      singleAmount: '500.3',
      singleCount: '5',
      recurringAmount: '120',
      recurringCount: '2',
    },
  ]);
  assert.equal(result.totalRows, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.currency, 'CAD');
});

test('runEnFundraising: by date, every fetched day has a row and unfetched days are listed', async () => {
  const result = await runEnFundraising(
    {
      dateRanges: [{ startDate: '2025-11-30', endDate: '2025-12-03' }],
      dimensions: ['date'],
      metrics: ['totalAmount', 'donationCount'],
    },
    memoryStore().store
  );
  assert.deepEqual(result.headers, ['date', 'totalAmount', 'donationCount']);
  assert.deepEqual(result.rows, [
    { date: '20251201', totalAmount: '120.1', donationCount: '2' },
    { date: '20251202', totalAmount: '500.2', donationCount: '5' },
  ]);
  assert.deepEqual(result.missingDays, ['2025-11-30', '2025-12-03']);
});

test('runEnFundraising: a fetched day with nothing in is a row of zeros, not a missing day', async () => {
  const quiet = [day('2025-12-01', '100', 0, 0), day('2025-12-01', '200', 0, 0)];
  const result = await runEnFundraising(
    {
      dateRanges: [{ startDate: '2025-12-01', endDate: '2025-12-01' }],
      dimensions: ['date'],
      metrics: ['totalAmount'],
    },
    memoryStore(quiet).store
  );
  assert.deepEqual(result.rows, [{ date: '20251201', totalAmount: '0' }]);
  assert.deepEqual(result.missingDays, []);
});

test('runEnFundraising: by page, with the EN page id and name, largest first', async () => {
  const result = await runEnFundraising(
    { dateRanges: [DEC], dimensions: ['page'], metrics: ['totalAmount'] },
    memoryStore().store
  );
  assert.deepEqual(result.headers, ['pageId', 'pageName', 'totalAmount']);
  assert.deepEqual(result.rows, [
    { pageId: '200', pageName: 'Page 200', totalAmount: '500' },
    { pageId: '100', pageName: 'Page 100', totalAmount: '120.3' },
  ]);
});

test('runEnFundraising: by date and page, only pages with gifts, by date then amount', async () => {
  const result = await runEnFundraising(
    { dateRanges: [DEC], dimensions: ['date', 'page'], metrics: ['totalAmount'] },
    memoryStore().store
  );
  assert.deepEqual(
    result.rows.map((row) => [row.date, row.pageId, row.totalAmount]),
    [
      ['20251201', '100', '120.1'],
      ['20251202', '200', '500'],
      ['20251202', '100', '0.2'],
    ]
  );
});

test('runEnFundraising: two date ranges add a dateRange column, named or numbered', async () => {
  const lastYear = { startDate: '2024-12-01', endDate: '2024-12-03', name: 'last_year' };
  const named = await runEnFundraising(
    { dateRanges: [{ ...DEC, name: 'this_year' }, lastYear], metrics: ['totalAmount'] },
    memoryStore().store
  );
  assert.deepEqual(named.headers, ['dateRange', 'totalAmount']);
  assert.deepEqual(named.rows, [
    { dateRange: 'this_year', totalAmount: '620.3' },
    { dateRange: 'last_year', totalAmount: '300' },
  ]);
  assert.deepEqual(named.missingDays, ['2024-12-01', '2024-12-02', '2025-12-03']);

  const numbered = await runEnFundraising(
    {
      dateRanges: [DEC, { startDate: '2024-12-01', endDate: '2024-12-03' }],
      dimensions: ['date'],
      metrics: ['donationCount'],
    },
    memoryStore().store
  );
  assert.deepEqual(numbered.headers, ['date', 'dateRange', 'donationCount']);
  assert.deepEqual(numbered.rows, [
    { date: '20251201', dateRange: 'date_range_0', donationCount: '2' },
    { date: '20251202', dateRange: 'date_range_0', donationCount: '5' },
    { date: '20241203', dateRange: 'date_range_1', donationCount: '3' },
  ]);
});

test('runEnFundraising: page ids reach the store', async () => {
  const { store, asked } = memoryStore();
  const result = await runEnFundraising(
    { dateRanges: [DEC], pageIds: ['100'], metrics: ['totalAmount'] },
    store
  );
  assert.deepEqual(asked, [['100']]);
  assert.deepEqual(result.rows, [{ totalAmount: '120.3' }]);
});

test('runEnFundraising: limit cuts the rows and says so', async () => {
  const result = await runEnFundraising(
    { dateRanges: [DEC], dimensions: ['date', 'page'], metrics: ['totalAmount'], limit: 2 },
    memoryStore().store
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.totalRows, 3);
  assert.equal(result.truncated, true);
});

test('runEnFundraising: relative dates, reversed ranges and five ranges are refused', async () => {
  const { store } = memoryStore();
  await assert.rejects(
    runEnFundraising({ dateRanges: [{ startDate: 'yesterday', endDate: '2025-12-02' }] }, store),
    RelativeDateError
  );
  await assert.rejects(
    runEnFundraising({ dateRanges: [{ startDate: '2025-12-02', endDate: '2025-12-01' }] }, store),
    /after/
  );
  await assert.rejects(runEnFundraising({ dateRanges: Array(5).fill(DEC) }, store), /one to four/);
  assert.equal(
    enFundraisingInputSchema.safeParse({ dateRanges: Array(5).fill(DEC) }).success,
    false
  );
  assert.equal(
    enFundraisingInputSchema.safeParse({ dateRanges: [DEC], dimensions: ['channel'] }).success,
    false
  );
});

test('runEnFundraising: the ledger reads it like a GA4 report and sums it across days and pages', async () => {
  const result = await runEnFundraising(
    { dateRanges: [DEC], dimensions: ['date', 'page'], metrics: ['totalAmount', 'donationCount'] },
    memoryStore().store
  );
  const table = queryTable(result);
  assert.deepEqual(table.headers, ['date', 'pageId', 'pageName', 'totalAmount', 'donationCount']);
  assert.equal(table.rows.length, 3);

  const ctx = { queries: { q1: table }, figures: {} };
  const total = computeFigure(
    { kind: 'aggregate', query: 'q1', column: 'totalAmount', agg: 'sum' },
    ctx,
    'currency'
  );
  assert.equal(Math.round(total.value! * 100) / 100, 620.3);
  const gifts = computeFigure(
    {
      kind: 'aggregate',
      query: 'q1',
      column: 'donationCount',
      agg: 'sum',
      where: [{ column: 'date', op: '=', value: '20251202' }],
    },
    ctx,
    'count'
  );
  assert.equal(gifts.value, 5);
});
