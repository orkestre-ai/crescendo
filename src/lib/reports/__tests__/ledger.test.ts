import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDataset,
  computeFigure,
  datasetQueryKeys,
  formatFigure,
  LedgerError,
  queryTable,
  type LedgerContext,
} from '../ledger';
import type { DatasetSpec, RowMatch } from '../types';

// GA4 returns every value as a string.
const ctx: LedgerContext = {
  queries: {
    // Daily sessions and revenue
    q1: {
      headers: ['date', 'sessions', 'purchaseRevenue'],
      rows: [
        { date: '20261119', sessions: '100', purchaseRevenue: '250.5' },
        { date: '20261120', sessions: '120', purchaseRevenue: '300' },
        { date: '20261121', sessions: '80', purchaseRevenue: '0' },
      ],
    },
    // Channels over two date ranges
    q2: {
      headers: ['sessionDefaultChannelGroup', 'dateRange', 'sessions', 'purchaseRevenue'],
      rows: [
        {
          sessionDefaultChannelGroup: 'Email',
          dateRange: 'this_year',
          sessions: '400',
          purchaseRevenue: '9000',
        },
        {
          sessionDefaultChannelGroup: 'Email',
          dateRange: 'last_year',
          sessions: '500',
          purchaseRevenue: '8000',
        },
        {
          sessionDefaultChannelGroup: 'Organic Search',
          dateRange: 'this_year',
          sessions: '300',
          purchaseRevenue: '3000',
        },
        {
          sessionDefaultChannelGroup: 'Organic Search',
          dateRange: 'last_year',
          sessions: '200',
          purchaseRevenue: '1000',
        },
        {
          sessionDefaultChannelGroup: 'Direct',
          dateRange: 'this_year',
          sessions: '0',
          purchaseRevenue: '0',
        },
      ],
    },
    // A result with a value that is not a number
    q3: {
      headers: ['pagePath', 'sessions'],
      rows: [
        { pagePath: '/donate', sessions: '(not set)' },
        { pagePath: '/thanks', sessions: '' },
      ],
    },
  },
  figures: { revenue: 550.5, sessions: 300, none: null },
};

// --- queryTable ---

test('queryTable: reads object rows and array rows alike', () => {
  const objects = queryTable({ headers: ['a', 'b'], rows: [{ a: '1', b: 2 }] });
  assert.deepEqual(objects, { headers: ['a', 'b'], rows: [{ a: '1', b: '2' }] });

  const arrays = queryTable({ headers: ['a', 'b'], rows: [['1', '2']] });
  assert.deepEqual(arrays.rows, [{ a: '1', b: '2' }]);

  assert.deepEqual(queryTable({ pages: 3 }), { headers: [], rows: [] });
  assert.deepEqual(queryTable(null), { headers: [], rows: [] });
});

// --- computeFigure: cell ---

test('computeFigure cell: reads one value from the one matching row', () => {
  const figure = computeFigure(
    {
      kind: 'cell',
      query: 'q1',
      column: 'sessions',
      where: [{ column: 'date', op: '=', value: '20261120' }],
    },
    ctx
  );
  assert.deepEqual(figure, { value: 120, text: null, rows: 1 });
});

test('computeFigure cell: the error says how many rows matched', () => {
  assert.throws(
    () => computeFigure({ kind: 'cell', query: 'q1', column: 'sessions', where: [] }, ctx),
    /matched 3 of the 3 rows in q1/
  );
  assert.throws(
    () =>
      computeFigure(
        {
          kind: 'cell',
          query: 'q1',
          column: 'sessions',
          where: [{ column: 'date', op: '=', value: '20270101' }],
        },
        ctx
      ),
    /matched 0 of the 3 rows/
  );
});

test('computeFigure cell: a value that is not a number is refused, naming the column', () => {
  assert.throws(
    () =>
      computeFigure(
        {
          kind: 'cell',
          query: 'q3',
          column: 'sessions',
          where: [{ column: 'pagePath', op: '=', value: '/donate' }],
        },
        ctx
      ),
    /Column "sessions" holds "\(not set\)", which is not a number/
  );
  // An empty cell is not zero.
  assert.throws(
    () =>
      computeFigure(
        {
          kind: 'cell',
          query: 'q3',
          column: 'sessions',
          where: [{ column: 'pagePath', op: '=', value: '/thanks' }],
        },
        ctx
      ),
    LedgerError
  );
});

test('computeFigure cell: with unit text it reads the value as text', () => {
  const figure = computeFigure(
    {
      kind: 'cell',
      query: 'q2',
      column: 'sessionDefaultChannelGroup',
      where: [
        { column: 'dateRange', op: '=', value: 'this_year' },
        { column: 'sessions', op: '>=', value: '400' },
      ],
    },
    ctx,
    'text'
  );
  assert.deepEqual(figure, { value: null, text: 'Email', rows: 1 });
});

test('computeFigure: an unknown query or column is refused with what exists', () => {
  assert.throws(
    () => computeFigure({ kind: 'cell', query: 'q9', column: 'sessions', where: [] }, ctx),
    /There is no saved query "q9"/
  );
  assert.throws(
    () => computeFigure({ kind: 'aggregate', query: 'q1', column: 'revenue', agg: 'sum' }, ctx),
    /Query q1 has no column "revenue"\. Its columns are: date, sessions, purchaseRevenue/
  );
  assert.throws(
    () =>
      computeFigure(
        {
          kind: 'aggregate',
          query: 'q1',
          column: 'sessions',
          agg: 'sum',
          where: [{ column: 'day', op: '=', value: 'x' }],
        },
        ctx
      ),
    /no column "day"/
  );
});

// --- computeFigure: aggregate ---

test('computeFigure aggregate: sum, avg, min, max and count', () => {
  const agg = (kind: 'sum' | 'avg' | 'min' | 'max' | 'count') =>
    computeFigure({ kind: 'aggregate', query: 'q1', column: 'purchaseRevenue', agg: kind }, ctx)
      .value;
  assert.equal(agg('sum'), 550.5);
  assert.equal(agg('avg'), 183.5);
  assert.equal(agg('min'), 0);
  assert.equal(agg('max'), 300);
  assert.equal(agg('count'), 3);
});

test('computeFigure aggregate: sessions and users do not add up across days or pages', () => {
  const sum = (query: string, column: string, where?: RowMatch[]) =>
    computeFigure({ kind: 'aggregate', query, column, agg: 'sum', where }, ctx).value;

  // A session that runs past midnight is in two daily rows.
  assert.throws(
    () => sum('q1', 'sessions'),
    (err: unknown) =>
      err instanceof LedgerError &&
      /"sessions" does not add up across the "date" rows of q1/.test(err.message) &&
      /Run a query without "date"/.test(err.message) &&
      /as a cell/.test(err.message)
  );
  // Money adds up across days, and one day is just that day.
  assert.equal(sum('q1', 'purchaseRevenue'), 550.5);
  assert.equal(sum('q1', 'sessions', [{ column: 'date', op: '=', value: '20261120' }]), 120);
  // The average day is still fine.
  assert.equal(
    computeFigure({ kind: 'aggregate', query: 'q1', column: 'sessions', agg: 'avg' }, ctx).value,
    100
  );
  // Each session has one channel, but GA4 estimates each row's count on its
  // own, so even channels do not add up to GA4's total.
  assert.throws(
    () => sum('q2', 'sessions', [{ column: 'dateRange', op: '=', value: 'this_year' }]),
    /across the "sessionDefaultChannelGroup" rows of q2/
  );

  const split: LedgerContext = {
    queries: {
      q1: {
        headers: ['date', 'deviceCategory', 'totalUsers', 'newUsers'],
        rows: [
          { date: '20261120', deviceCategory: 'mobile', totalUsers: '10', newUsers: '4' },
          { date: '20261120', deviceCategory: 'desktop', totalUsers: '5', newUsers: '2' },
          { date: '20261121', deviceCategory: 'mobile', totalUsers: '8', newUsers: '3' },
        ],
      },
      q2: {
        headers: ['pagePath', 'newUsers'],
        rows: [
          { pagePath: '/donate', newUsers: '4' },
          { pagePath: '/thanks', newUsers: '3' },
        ],
      },
    },
    figures: {},
  };
  const splitSum = (query: string, column: string, where?: RowMatch[]) =>
    computeFigure({ kind: 'aggregate', query, column, agg: 'sum', where }, split).value;
  // One row adds up to itself; rows split by device or by day do not.
  assert.equal(
    splitSum('q1', 'totalUsers', [
      { column: 'date', op: '=', value: '20261120' },
      { column: 'deviceCategory', op: '=', value: 'mobile' },
    ]),
    10
  );
  assert.throws(
    () => splitSum('q1', 'totalUsers', [{ column: 'date', op: '=', value: '20261120' }]),
    /across the "deviceCategory" rows/
  );
  assert.throws(() => splitSum('q1', 'totalUsers'), /"totalUsers" does not add up across/);
  // A user is new on one day only, but can see many pages.
  assert.equal(splitSum('q1', 'newUsers'), 9);
  assert.throws(() => splitSum('q2', 'newUsers'), /across the "pagePath" rows of q2/);
});

test('computeFigure aggregate: sums decimals without rounding', () => {
  const figure = computeFigure(
    { kind: 'aggregate', query: 'q1', column: 'purchaseRevenue', agg: 'sum' },
    ctx
  );
  assert.equal(figure.value, 550.5);
});

test('computeFigure aggregate: where narrows the rows, and reports how many it read', () => {
  const figure = computeFigure(
    {
      kind: 'aggregate',
      query: 'q2',
      column: 'purchaseRevenue',
      agg: 'sum',
      where: [{ column: 'dateRange', op: '=', value: 'this_year' }],
    },
    ctx
  );
  assert.deepEqual(figure, { value: 12000, text: null, rows: 3 });
});

test('computeFigure aggregate: every match operator', () => {
  const sum = (where: RowMatch[]) =>
    computeFigure(
      { kind: 'aggregate', query: 'q2', column: 'purchaseRevenue', agg: 'sum', where },
      ctx
    ).value;

  assert.equal(sum([{ column: 'sessionDefaultChannelGroup', op: '!=', value: 'Email' }]), 4000);
  assert.equal(
    sum([{ column: 'sessionDefaultChannelGroup', op: 'contains', value: 'Search' }]),
    4000
  );
  assert.equal(
    sum([{ column: 'sessionDefaultChannelGroup', op: 'in', value: ['Email', 'Direct'] }]),
    17000
  );
  // Numbers compare as numbers, not as text.
  assert.equal(sum([{ column: 'sessions', op: '>=', value: '300' }]), 20000);
  assert.equal(sum([{ column: 'sessions', op: '<=', value: '200' }]), 1000);
  // Text compares exactly, with case.
  assert.equal(sum([{ column: 'sessionDefaultChannelGroup', op: '=', value: 'email' }]), 0);
});

test('computeFigure aggregate: dates compare in order', () => {
  const figure = computeFigure(
    {
      kind: 'aggregate',
      query: 'q1',
      column: 'purchaseRevenue',
      agg: 'sum',
      where: [
        { column: 'date', op: '>=', value: '20261120' },
        { column: 'date', op: '<=', value: '20261121' },
      ],
    },
    ctx
  );
  assert.equal(figure.value, 300);
});

test('computeFigure aggregate: no rows gives a sum and a count of zero, but no average', () => {
  const none = [{ column: 'date', op: '=' as const, value: '20270101' }];
  assert.deepEqual(
    computeFigure(
      { kind: 'aggregate', query: 'q1', column: 'sessions', agg: 'sum', where: none },
      ctx
    ),
    {
      value: 0,
      text: null,
      rows: 0,
    }
  );
  assert.equal(
    computeFigure(
      { kind: 'aggregate', query: 'q1', column: 'sessions', agg: 'count', where: none },
      ctx
    ).value,
    0
  );
  for (const agg of ['avg', 'min', 'max'] as const) {
    assert.throws(
      () =>
        computeFigure(
          { kind: 'aggregate', query: 'q1', column: 'sessions', agg, where: none },
          ctx
        ),
      /No rows of q1 matched/
    );
  }
});

test('computeFigure aggregate: a match needs the right kind of value', () => {
  assert.throws(
    () =>
      computeFigure(
        {
          kind: 'aggregate',
          query: 'q1',
          column: 'sessions',
          agg: 'sum',
          where: [{ column: 'date', op: 'in', value: '20261120' }],
        },
        ctx
      ),
    /needs a list of values/
  );
  assert.throws(
    () =>
      computeFigure(
        {
          kind: 'aggregate',
          query: 'q1',
          column: 'sessions',
          agg: 'sum',
          where: [{ column: 'date', op: '=', value: ['a'] }],
        },
        ctx
      ),
    /needs one value/
  );
});

// --- computeFigure: formula and stated ---

test('computeFigure formula: refs map names to figure keys', () => {
  const figure = computeFigure(
    { kind: 'formula', expr: 'r / s', refs: { r: 'revenue', s: 'sessions' } },
    ctx
  );
  assert.equal(figure.value, 550.5 / 300);
});

test('computeFigure formula: a missing or empty figure is refused by name', () => {
  assert.throws(
    () => computeFigure({ kind: 'formula', expr: 'a + 1', refs: { a: 'donors' } }, ctx),
    /figure "donors", which has not been recorded/
  );
  assert.throws(
    () => computeFigure({ kind: 'formula', expr: 'a + 1', refs: { a: 'none' } }, ctx),
    /Figure "none" has no number/
  );
});

test('computeFigure formula: division by zero and bad arithmetic are refused', () => {
  assert.throws(
    () =>
      computeFigure(
        { kind: 'formula', expr: 'r / (s - s)', refs: { r: 'revenue', s: 'sessions' } },
        ctx
      ),
    /divides by zero/
  );
  assert.throws(() =>
    computeFigure({ kind: 'formula', expr: 'r ** 2', refs: { r: 'revenue' } }, ctx)
  );
  // A name that is not in refs has no value.
  assert.throws(
    () => computeFigure({ kind: 'formula', expr: 'r / sessions', refs: { r: 'revenue' } }, ctx),
    /"sessions", which has no value/
  );
});

test('computeFigure stated: a number or a text, as given', () => {
  assert.deepEqual(
    computeFigure({ kind: 'stated', value: 42, reason: 'From the mail house' }, ctx),
    {
      value: 42,
      text: null,
      rows: 0,
    }
  );
  assert.deepEqual(
    computeFigure({ kind: 'stated', value: 'CRM export', reason: 'Not in GA4' }, ctx),
    {
      value: null,
      text: 'CRM export',
      rows: 0,
    }
  );
});

// --- computeDataset ---

test('computeDataset: select renames, formats and keeps text', () => {
  const dataset = computeDataset(
    {
      from: 'q1',
      select: [
        { column: 'date' },
        { column: 'sessions', format: 'count' },
        { column: 'purchaseRevenue', as: 'revenue', format: 'currency' },
      ],
    },
    ctx
  );
  assert.deepEqual(dataset.columns, [
    { key: 'date', format: 'text' },
    { key: 'sessions', format: 'count' },
    { key: 'revenue', format: 'currency' },
  ]);
  assert.deepEqual(dataset.rows, [
    ['20261119', 100, 250.5],
    ['20261120', 120, 300],
    ['20261121', 80, 0],
  ]);
});

test('computeDataset: where filters the rows', () => {
  const dataset = computeDataset(
    {
      from: 'q2',
      select: [
        { column: 'sessionDefaultChannelGroup', as: 'channel' },
        { column: 'sessions', format: 'count' },
      ],
      where: [{ column: 'dateRange', op: '=', value: 'last_year' }],
    },
    ctx
  );
  assert.deepEqual(dataset.rows, [
    ['Email', 500],
    ['Organic Search', 200],
  ]);
});

test('computeDataset: join puts two periods side by side; a row with no match gets an empty cell', () => {
  const dataset = computeDataset(
    {
      from: 'q2',
      select: [
        { column: 'sessionDefaultChannelGroup', as: 'channel' },
        { column: 'sessions', as: 'sessions_now', format: 'count' },
      ],
      where: [{ column: 'dateRange', op: '=', value: 'this_year' }],
      join: [
        {
          query: 'q2',
          on: 'sessionDefaultChannelGroup',
          where: [{ column: 'dateRange', op: '=', value: 'last_year' }],
          select: [{ column: 'sessions', as: 'sessions_before', format: 'count' }],
        },
      ],
    },
    ctx
  );
  assert.deepEqual(
    dataset.columns.map((c) => c.key),
    ['channel', 'sessions_now', 'sessions_before']
  );
  assert.deepEqual(dataset.rows, [
    ['Email', 400, 500],
    ['Organic Search', 300, 200],
    ['Direct', 0, null],
  ]);
});

test('computeDataset: a join key that is not unique is refused', () => {
  assert.throws(
    () =>
      computeDataset(
        {
          from: 'q2',
          select: [{ column: 'sessionDefaultChannelGroup', as: 'channel' }],
          join: [
            {
              query: 'q2',
              on: 'sessionDefaultChannelGroup',
              select: [{ column: 'sessions', as: 's', format: 'count' }],
            },
          ],
        },
        ctx
      ),
    /"Email" appears in more than one row/
  );
});

test('computeDataset: a computed column is worked out per row and never rounded', () => {
  const dataset = computeDataset(
    {
      from: 'q1',
      select: [
        { column: 'date' },
        { column: 'sessions', format: 'count' },
        { column: 'purchaseRevenue', as: 'revenue', format: 'currency' },
      ],
      computed: [{ as: 'revenue_per_session', expr: 'revenue / sessions', format: 'currency' }],
    },
    ctx
  );
  assert.deepEqual(dataset.columns[3], { key: 'revenue_per_session', format: 'currency' });
  assert.deepEqual(
    dataset.rows.map((row) => row[3]),
    [250.5 / 100, 300 / 120, 0]
  );
});

test('computeDataset: a computed cell is empty when it would divide by zero or an input is missing', () => {
  const dataset = computeDataset(
    {
      from: 'q2',
      select: [
        { column: 'sessionDefaultChannelGroup', as: 'channel' },
        { column: 'sessions', format: 'count' },
        { column: 'purchaseRevenue', as: 'revenue', format: 'currency' },
      ],
      where: [{ column: 'dateRange', op: '=', value: 'this_year' }],
      join: [
        {
          query: 'q2',
          on: 'sessionDefaultChannelGroup',
          where: [{ column: 'dateRange', op: '=', value: 'last_year' }],
          select: [{ column: 'purchaseRevenue', as: 'revenue_before', format: 'currency' }],
        },
      ],
      computed: [
        { as: 'per_session', expr: 'revenue / sessions' },
        { as: 'change', expr: '(revenue - revenue_before) / revenue_before', format: 'percent' },
      ],
    },
    ctx
  );
  const direct = dataset.rows[2];
  assert.deepEqual(direct, ['Direct', 0, 0, null, null, null]);
  assert.equal(dataset.rows[0][5], 0.125);
  // A computed column is a ratio unless told otherwise.
  assert.equal(dataset.columns[4].format, 'ratio');
});

test('computeDataset: a computed column over text, an unknown name or bad arithmetic is refused', () => {
  const spec = (expr: string): DatasetSpec => ({
    from: 'q1',
    select: [{ column: 'date' }, { column: 'sessions', format: 'count' }],
    computed: [{ as: 'x', expr }],
  });
  assert.throws(() => computeDataset(spec('date * 2'), ctx), /uses "date", which is text/);
  assert.throws(
    () => computeDataset(spec('visits * 2'), ctx),
    /uses "visits", which is not a column before it/
  );
  assert.throws(() => computeDataset(spec('sessions ** 2'), ctx));
});

test('computeDataset: sort and limit', () => {
  const dataset = computeDataset(
    {
      from: 'q1',
      select: [{ column: 'date' }, { column: 'sessions', format: 'count' }],
      sort: [{ column: 'sessions', desc: true }],
      limit: 2,
    },
    ctx
  );
  assert.deepEqual(dataset.rows, [
    ['20261120', 120],
    ['20261119', 100],
  ]);
});

test('computeDataset: sort puts empty cells last and breaks ties with the next column', () => {
  const dataset = computeDataset(
    {
      from: 'q2',
      select: [{ column: 'sessionDefaultChannelGroup', as: 'channel' }, { column: 'dateRange' }],
      join: [
        {
          query: 'q2',
          on: 'sessionDefaultChannelGroup',
          where: [{ column: 'dateRange', op: '=', value: 'last_year' }],
          select: [{ column: 'sessions', as: 'before', format: 'count' }],
        },
      ],
      where: [{ column: 'dateRange', op: '=', value: 'this_year' }],
      sort: [{ column: 'before' }, { column: 'channel' }],
    },
    ctx
  );
  assert.deepEqual(
    dataset.rows.map((row) => row[0]),
    ['Organic Search', 'Email', 'Direct']
  );
});

test('computeDataset: a running total follows the sorted order', () => {
  const dataset = computeDataset(
    {
      from: 'q1',
      select: [
        { column: 'date' },
        { column: 'purchaseRevenue', as: 'revenue', format: 'currency' },
        { column: 'purchaseRevenue', as: 'revenue_to_date', format: 'currency' },
      ],
      sort: [{ column: 'date' }],
      cumulative: ['revenue_to_date'],
    },
    ctx
  );
  assert.deepEqual(dataset.rows, [
    ['20261119', 250.5, 250.5],
    ['20261120', 300, 550.5],
    ['20261121', 0, 550.5],
  ]);
});

test('computeDataset: the total row adds money, leaves sessions over channels empty, and works rates out again', () => {
  const dataset = computeDataset(
    {
      from: 'q2',
      select: [
        { column: 'sessionDefaultChannelGroup', as: 'channel' },
        { column: 'sessions', format: 'count' },
        { column: 'purchaseRevenue', as: 'revenue', format: 'currency' },
      ],
      where: [{ column: 'dateRange', op: '=', value: 'this_year' }],
      computed: [{ as: 'per_session', expr: 'revenue / sessions', format: 'currency' }],
      totalRow: true,
    },
    ctx
  );
  assert.equal(dataset.rows.length, 4);
  // Channel sessions do not add up to GA4's total, so neither they nor the rate
  // worked out from them get a total.
  assert.deepEqual(dataset.rows[3], ['Total', null, 12000, null]);
});

test('computeDataset: the total row leaves sessions over days empty, and what is worked out from them', () => {
  const dataset = computeDataset(
    {
      from: 'q1',
      select: [
        { column: 'date' },
        { column: 'sessions', format: 'count' },
        { column: 'purchaseRevenue', as: 'revenue', format: 'currency' },
      ],
      join: [
        {
          query: 'q1',
          on: 'date',
          select: [{ column: 'sessions', as: 'joined_sessions', format: 'count' }],
        },
      ],
      computed: [{ as: 'per_session', expr: 'revenue / sessions', format: 'currency' }],
      totalRow: true,
    },
    ctx
  );
  assert.deepEqual(dataset.rows[0], ['20261119', 100, 250.5, 100, 250.5 / 100]);
  assert.deepEqual(dataset.rows[3], ['Total', null, 550.5, null, null]);
});

test('computeDataset: the total of a running-total column is its last value, and a selected rate has no total', () => {
  const rates: LedgerContext = {
    queries: {
      q1: {
        headers: ['deviceCategory', 'transactions', 'bounceRate'],
        rows: [
          { deviceCategory: 'mobile', transactions: '10', bounceRate: '0.5' },
          { deviceCategory: 'desktop', transactions: '30', bounceRate: '0.25' },
        ],
      },
    },
    figures: {},
  };
  const dataset = computeDataset(
    {
      from: 'q1',
      select: [
        { column: 'deviceCategory' },
        { column: 'transactions', format: 'count' },
        { column: 'bounceRate', format: 'percent' },
      ],
      cumulative: ['transactions'],
      totalRow: true,
    },
    rates
  );
  assert.deepEqual(dataset.rows, [
    ['mobile', 10, 0.5],
    ['desktop', 40, 0.25],
    ['Total', 40, null],
  ]);
});

test('computeDataset: bad column names, repeats and unknown columns are refused', () => {
  assert.throws(
    () => computeDataset({ from: 'q1', select: [{ column: 'date' }, { column: 'date' }] }, ctx),
    /two columns named "date"/
  );
  assert.throws(
    () => computeDataset({ from: 'q1', select: [{ column: 'date', as: 'the day' }] }, ctx),
    /"the day" cannot be a column name/
  );
  assert.throws(
    () => computeDataset({ from: 'q1', select: [{ column: 'day' }] }, ctx),
    /no column "day"/
  );
  assert.throws(
    () =>
      computeDataset(
        { from: 'q1', select: [{ column: 'date' }], sort: [{ column: 'sessions' }] },
        ctx
      ),
    /Cannot sort by "sessions"/
  );
  assert.throws(
    () => computeDataset({ from: 'q1', select: [{ column: 'date' }], cumulative: ['date'] }, ctx),
    /Cannot keep a running total of "date"/
  );
  assert.throws(
    () => computeDataset({ from: 'q3', select: [{ column: 'sessions', format: 'count' }] }, ctx),
    /Column "sessions" holds "\(not set\)"/
  );
});

test('datasetQueryKeys: the first query and every joined one, once each', () => {
  assert.deepEqual(
    datasetQueryKeys({
      from: 'q1',
      select: [],
      join: [
        { query: 'q2', on: 'date', select: [] },
        { query: 'q1', on: 'date', select: [] },
      ],
    }),
    ['q1', 'q2']
  );
});

// --- formatFigure ---

test('formatFigure: currency shows cents under a thousand and whole units above', () => {
  assert.equal(formatFigure(45.5, 'currency', 'CAD'), '$45.50');
  assert.equal(formatFigure(999.999, 'currency', 'CAD'), '$1,000.00');
  assert.equal(formatFigure(12345.67, 'currency', 'CAD'), '$12,346');
  assert.equal(formatFigure(-250, 'currency', 'USD'), '-$250.00');
  assert.equal(formatFigure(1500, 'currency', 'EUR'), '€1,500');
});

test('formatFigure: counts, percents and ratios', () => {
  assert.equal(formatFigure(1234567, 'count', 'CAD'), '1,234,567');
  assert.equal(formatFigure(12.34, 'count', 'CAD'), '12.3');
  assert.equal(formatFigure(0.0487, 'percent', 'CAD'), '4.9%');
  assert.equal(formatFigure(0.25, 'percent', 'CAD'), '25.0%');
  assert.equal(formatFigure(-0.125, 'percent', 'CAD'), '-12.5%');
  assert.equal(formatFigure(1.8549, 'ratio', 'CAD'), '1.85');
});

test('formatFigure: text passes through and an empty value is a dash', () => {
  assert.equal(formatFigure('Email', 'text', 'CAD'), 'Email');
  assert.equal(formatFigure(null, 'count', 'CAD'), '—');
});

test('formatFigure: an unknown currency code still gives a number', () => {
  assert.equal(formatFigure(12.5, 'currency', 'not-a-code'), '12.50 not-a-code');
  assert.equal(formatFigure(12.5, 'currency', null), '$12.50');
});
