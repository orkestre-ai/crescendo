import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEnDaily,
  daysBetween,
  type EnDailyRow,
  type EnDailyStore,
  type EnSummaryClient,
} from '../en-daily';
import type { FundraisingSummaryData } from '@/types/fundraising';
import { zonedDate } from '../time-zone';

type Call = { pageId: string; startDate: string; endDate: string };

function summary(totalAmount: number, donationCount: number): FundraisingSummaryData {
  return {
    pageId: 0,
    pageName: '',
    period: { startDate: '', endDate: '' },
    totalAmount,
    donationCount,
    singleAmount: totalAmount * 0.75,
    singleCount: donationCount - 1,
    recurringAmount: totalAmount * 0.25,
    recurringCount: 1,
    currency: 'CAD',
    fetchedAt: new Date(),
  };
}

/** A client that records calls and answers from `answer`. */
function fakeClient(answer: (call: Call) => FundraisingSummaryData | null | Error) {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const client: EnSummaryClient = {
    async fetchFundraisingSummaryByPage(pageId, startDate, endDate) {
      const call = { pageId: String(pageId), startDate, endDate };
      calls.push(call);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      const result = answer(call);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, calls, maxInFlight: () => maxInFlight };
}

/** Pages by EN page id, and stored rows keyed like the unique index. */
function memoryStore(enPageIds: string[]) {
  const rows = new Map<string, EnDailyRow>();
  const asked: (string[] | undefined)[] = [];
  const store: EnDailyStore = {
    async pages(filter) {
      asked.push(filter);
      return enPageIds
        .filter((id) => !filter || filter.includes(id))
        .map((enPageId) => ({ id: `cuid-${enPageId}`, enPageId }));
    },
    async currency() {
      return 'CAD';
    },
    async save(row) {
      rows.set(`${row.pageId}|${row.date}`, row);
    },
  };
  return { store, rows, asked };
}

const isRange = (call: Call) => call.startDate !== call.endDate;

test('daysBetween: both ends included, across a month end', () => {
  assert.deepEqual(daysBetween('2025-11-29', '2025-12-02'), [
    '2025-11-29',
    '2025-11-30',
    '2025-12-01',
    '2025-12-02',
  ]);
  assert.deepEqual(daysBetween('2025-12-02', '2025-12-02'), ['2025-12-02']);
  assert.throws(() => daysBetween('yesterday', '2025-12-02'), /YYYY-MM-DD/);
});

test("zonedDate: the day in the organisation's time zone, not in UTC", () => {
  // 03:00 UTC on 2 December is 22:00 on 1 December in Toronto.
  const now = new Date('2026-12-02T03:00:00Z');
  assert.equal(zonedDate(now, 'America/Toronto'), '2026-12-01');
  assert.equal(zonedDate(now, 'America/Toronto', 1), '2026-11-30');
  assert.equal(zonedDate(now, 'America/Toronto', 7), '2026-11-24');
  // The same moment is already 2 December in London.
  assert.equal(zonedDate(now, 'Europe/London'), '2026-12-02');
});

test('collectEnDaily: a page with nothing in the range costs one call and gets zero rows', async () => {
  const { client, calls } = fakeClient(() => null);
  const { store, rows } = memoryStore(['100']);

  const result = await collectEnDaily({ from: '2025-12-01', to: '2025-12-03', client, store });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { pageId: '100', startDate: '2025-12-01', endDate: '2025-12-03' });
  assert.equal(result.calls, 1);
  assert.equal(result.skippedPages, 1);
  assert.equal(result.daysWritten, 3);
  assert.equal(rows.size, 3);
  for (const row of rows.values()) {
    assert.equal(row.pageId, 'cuid-100');
    assert.equal(row.totalAmount, 0);
    assert.equal(row.donationCount, 0);
    assert.equal(row.recurringCount, 0);
    assert.equal(row.currency, 'CAD');
  }
});

test('collectEnDaily: a summary of zeros counts as nothing in the range', async () => {
  const { client, calls } = fakeClient(() => summary(0, 0));
  const { store } = memoryStore(['100']);
  const result = await collectEnDaily({ from: '2025-12-01', to: '2025-12-03', client, store });
  assert.equal(calls.length, 1);
  assert.equal(result.skippedPages, 1);
});

test('collectEnDaily: a page with gifts is asked day by day', async () => {
  const { client, calls } = fakeClient((call) =>
    isRange(call) ? summary(300, 3) : call.startDate === '2025-12-02' ? summary(200, 2) : null
  );
  const { store, rows } = memoryStore(['100']);

  const result = await collectEnDaily({ from: '2025-12-01', to: '2025-12-03', client, store });

  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls
      .filter((call) => !isRange(call))
      .map((call) => call.startDate)
      .sort(),
    ['2025-12-01', '2025-12-02', '2025-12-03']
  );
  assert.equal(result.skippedPages, 0);
  assert.equal(result.daysWritten, 3);
  assert.equal(rows.get('cuid-100|2025-12-02')?.totalAmount, 200);
  assert.equal(rows.get('cuid-100|2025-12-02')?.recurringAmount, 50);
  assert.equal(rows.get('cuid-100|2025-12-01')?.totalAmount, 0);
  assert.equal(rows.get('cuid-100|2025-12-03')?.donationCount, 0);
});

test('collectEnDaily: running again replaces the same days', async () => {
  const { store, rows } = memoryStore(['100', '200']);
  let amount = 100;
  const { client } = fakeClient((call) => (call.pageId === '100' ? summary(amount, 1) : null));

  await collectEnDaily({ from: '2025-12-01', to: '2025-12-02', client, store });
  assert.equal(rows.size, 4);
  amount = 80;
  await collectEnDaily({ from: '2025-12-01', to: '2025-12-02', client, store });
  assert.equal(rows.size, 4);
  assert.equal(rows.get('cuid-100|2025-12-01')?.totalAmount, 80);
});

test('collectEnDaily: only the pages asked for, by EN page id', async () => {
  const { client, calls } = fakeClient(() => null);
  const { store, asked } = memoryStore(['100', '200', '300']);
  const result = await collectEnDaily({
    from: '2025-12-01',
    to: '2025-12-01',
    pageIds: ['200'],
    client,
    store,
  });
  assert.deepEqual(asked, [['200']]);
  assert.equal(result.pages, 1);
  assert.deepEqual(
    calls.map((call) => call.pageId),
    ['200']
  );
});

test('collectEnDaily: a network error is tried once more', async () => {
  let failures = 0;
  const { client, calls } = fakeClient(() => {
    if (failures++ === 0) return new TypeError('fetch failed');
    return null;
  });
  const { store, rows } = memoryStore(['100']);
  const result = await collectEnDaily({ from: '2025-12-01', to: '2025-12-02', client, store });
  assert.equal(calls.length, 2);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(rows.size, 2);
});

test('collectEnDaily: a failing page is recorded, left unwritten, and the others carry on', async () => {
  const { client, calls } = fakeClient((call) =>
    call.pageId === '100' ? new Error('EN API error: no such page') : null
  );
  const { store, rows } = memoryStore(['100', '200']);

  const result = await collectEnDaily({ from: '2025-12-01', to: '2025-12-02', client, store });

  // An API error is not retried.
  assert.equal(calls.filter((call) => call.pageId === '100').length, 1);
  assert.deepEqual(result.errors, [{ pageId: '100', message: 'EN API error: no such page' }]);
  assert.equal(rows.size, 2);
  assert.ok([...rows.keys()].every((key) => key.startsWith('cuid-200|')));
});

test('collectEnDaily: a failing day is recorded with its date, and the other days are written', async () => {
  const { client } = fakeClient((call) =>
    isRange(call)
      ? summary(100, 1)
      : call.startDate === '2025-12-02'
        ? new Error('HTTP 400: Bad Request')
        : summary(50, 1)
  );
  const { store, rows } = memoryStore(['100']);

  const result = await collectEnDaily({ from: '2025-12-01', to: '2025-12-03', client, store });

  assert.deepEqual(result.errors, [
    { pageId: '100', date: '2025-12-02', message: 'HTTP 400: Bad Request' },
  ]);
  assert.equal(result.daysWritten, 2);
  assert.equal(rows.has('cuid-100|2025-12-02'), false);
});

test('collectEnDaily: no more calls at once than the concurrency', async () => {
  const fake = fakeClient((call) => (isRange(call) ? summary(10, 1) : null));
  const { store } = memoryStore(['1', '2', '3', '4', '5', '6']);
  await collectEnDaily({
    from: '2025-12-01',
    to: '2025-12-05',
    concurrency: 2,
    client: fake.client,
    store,
  });
  assert.equal(fake.calls.length, 6 + 6 * 5);
  assert.ok(fake.maxInFlight() <= 2, `saw ${fake.maxInFlight()} calls at once`);
});

test('collectEnDaily: refuses a range that ends before it starts', async () => {
  const { client } = fakeClient(() => null);
  const { store } = memoryStore(['100']);
  await assert.rejects(
    collectEnDaily({ from: '2025-12-02', to: '2025-12-01', client, store }),
    /is after/
  );
});
