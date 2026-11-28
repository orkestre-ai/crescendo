import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEDGER_CSV_COLUMNS, ledgerToCsv } from '../ledger-csv';
import type { ReportQuery } from '../types';
import { figure } from './blocks-fixtures';
import { fixtureReport } from './pdf-fixture';

/** Read CSV back as a spreadsheet would: quoted cells may hold commas, quotes and line breaks. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      rows[rows.length - 1].push(cell);
      cell = '';
    } else if (char === '\r' && csv[i + 1] === '\n') {
      rows[rows.length - 1].push(cell);
      cell = '';
      rows.push([]);
      i++;
    } else cell += char;
  }
  rows.pop();
  return rows;
}

const query = (key: string, extra: Partial<ReportQuery> = {}): ReportQuery => ({
  runId: 'run1',
  key,
  tool: 'ga4_report',
  params: {
    dimensions: ['date'],
    metrics: ['totalRevenue', 'transactions'],
    dateRanges: [{ startDate: '2025-11-15', endDate: '2025-12-31' }],
  },
  result: {},
  rowCount: 47,
  sampled: false,
  samplingNote: null,
  recheck: null,
  ...extra,
});

const column = (name: string) => LEDGER_CSV_COLUMNS.indexOf(name);

test('ledgerToCsv: a header row, then one row per figure, ending each record with CRLF', () => {
  const csv = ledgerToCsv(
    [
      figure('revenue', 5400.5, 'currency', {
        label: 'Online revenue',
        source: { kind: 'aggregate', query: 'q1', column: 'totalRevenue', agg: 'sum' },
        queryKeys: ['q1'],
        recheckStatus: 'corrected',
        previousValue: 5300,
      }),
    ],
    [query('q1')]
  );
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(csv.split('\r\n').length, 3);
  const [head, row] = parseCsv(csv);
  assert.deepEqual(head, [
    'Figure',
    'Label',
    'Value as shown',
    'Raw value',
    'Unit',
    'How it was computed',
    'Query',
    'Tool',
    'Dimensions',
    'Metrics',
    'Dates',
    'Filters',
    'Sampled',
    'Recheck status',
    'Previous value',
  ]);
  assert.deepEqual(row, [
    'revenue',
    'Online revenue',
    '$5,401',
    '5400.5',
    'currency',
    'sum of totalRevenue in q1',
    'q1',
    'ga4_report',
    'date',
    'totalRevenue; transactions',
    '2025-11-15 to 2025-12-31',
    '',
    'no',
    'corrected',
    '5300',
  ]);
});

test('ledgerToCsv: commas, quotes and line breaks are quoted and read back whole', () => {
  const label = 'Revenue, "online"\nfirst week';
  const csv = ledgerToCsv([figure('revenue', 1234567.5, 'currency', { label })], []);
  // The raw text: the cell is wrapped in quotes and its own quotes are doubled.
  assert.ok(csv.includes('"Revenue, ""online""\nfirst week"'));
  assert.ok(csv.includes('"$1,234,568"'));
  const [, row] = parseCsv(csv);
  assert.equal(row.length, LEDGER_CSV_COLUMNS.length);
  assert.equal(row[column('Label')], label);
  assert.equal(row[column('Value as shown')], '$1,234,568');
  assert.equal(row[column('Raw value')], '1234567.5');
});

test('ledgerToCsv: a figure built from two queries gets one row per query', () => {
  const csv = ledgerToCsv(
    [
      figure('change', 0.0637, 'percent', {
        source: {
          kind: 'formula',
          expr: '(now - before) / before',
          refs: { now: 'revenue', before: 'revenue_before' },
        },
        queryKeys: ['q1', 'q2'],
      }),
      figure('emails', 48_200, 'count', {
        source: { kind: 'stated', value: 48_200, reason: 'From the email platform, by hand.' },
        recheckStatus: 'stated',
      }),
    ],
    [
      query('q1'),
      query('q2', {
        params: {
          dimensions: ['date'],
          metrics: ['totalRevenue'],
          dateRanges: [{ startDate: '2024-11-15', endDate: '2024-12-31' }],
        },
        sampled: true,
        samplingNote: 'Estimated from 34% of events.',
      }),
    ]
  );
  const rows = parseCsv(csv).slice(1);
  assert.deepEqual(
    rows.map((row) => [row[column('Figure')], row[column('Query')], row[column('Dates')]]),
    [
      ['change', 'q1', '2025-11-15 to 2025-12-31'],
      ['change', 'q2', '2024-11-15 to 2024-12-31'],
      ['emails', '', ''],
    ]
  );
  // Both rows of the figure carry the figure itself, so either can be read alone.
  for (const row of rows.slice(0, 2)) {
    assert.equal(row[column('Value as shown')], '6.4%');
    assert.equal(
      row[column('How it was computed')],
      '(now - before) / before, with now = revenue, before = revenue_before'
    );
  }
  assert.equal(rows[1][column('Sampled')], 'yes: Estimated from 34% of events.');
  // A stated figure has no query: its query columns are empty and it says so.
  assert.equal(rows[2][column('Tool')], '');
  assert.equal(rows[2][column('Sampled')], '');
  assert.equal(rows[2][column('How it was computed')], 'Stated: From the email platform, by hand.');
  assert.equal(rows[2][column('Recheck status')], 'stated');
});

test('ledgerToCsv: filters and funnel steps are written as a person would say them', () => {
  const csv = ledgerToCsv(
    [
      figure('donate_revenue', 900, 'currency', { queryKeys: ['q1'] }),
      figure('gave', 41, 'count', { queryKeys: ['q2'] }),
    ],
    [
      query('q1', {
        params: {
          dimensions: ['pagePath', 'country'],
          metrics: ['totalRevenue'],
          dateRanges: [
            { startDate: '2025-12-02', endDate: '2025-12-02' },
            { startDate: '2024-12-03', endDate: '2024-12-03' },
          ],
          dimensionFilter: {
            and: [
              { field: 'pagePath', match: 'contains', value: '/donate' },
              { not: { field: 'country', match: 'inList', values: ['Canada', 'France'] } },
            ],
          },
          metricFilter: { field: 'totalRevenue', op: '>', number: 0 },
        },
      }),
      query('q2', {
        tool: 'ga4_funnel',
        params: {
          steps: [
            {
              name: 'Viewed the form',
              eventName: 'page_view',
              params: [{ name: 'page_location', match: 'contains', value: '/donate' }],
            },
            { name: 'Gave', eventName: 'purchase' },
          ],
          dateRange: { startDate: '2025-11-15', endDate: '2025-12-31' },
          breakdownDimension: 'deviceCategory',
        },
      }),
    ]
  );
  const [, report, funnel] = parseCsv(csv);
  assert.equal(report[column('Dimensions')], 'pagePath; country');
  assert.equal(report[column('Dates')], '2025-12-02 to 2025-12-02; 2024-12-03 to 2024-12-03');
  assert.equal(
    report[column('Filters')],
    '(pagePath contains "/donate" and not country inList "Canada", "France"); totalRevenue > 0'
  );
  assert.equal(funnel[column('Tool')], 'ga4_funnel');
  assert.equal(funnel[column('Dimensions')], 'deviceCategory');
  assert.equal(funnel[column('Metrics')], '');
  assert.equal(funnel[column('Dates')], '2025-11-15 to 2025-12-31');
  assert.equal(
    funnel[column('Filters')],
    'Viewed the form (page_view, page_location contains "/donate") > Gave (purchase)'
  );
});

test('ledgerToCsv: text from outside cannot start a cell as a formula; numbers are left alone', () => {
  const csv = ledgerToCsv(
    [
      figure('top_campaign', null, 'text', {
        label: '=HYPERLINK("https://example.com")',
        text: '@SUM(A1)',
        display: '@SUM(A1)',
      }),
      figure('change', -0.25, 'percent', { label: 'Change', previousValue: -0.5 }),
    ],
    []
  );
  const [, text, number] = parseCsv(csv);
  assert.equal(text[column('Label')], '\'=HYPERLINK("https://example.com")');
  assert.equal(text[column('Value as shown')], "'@SUM(A1)");
  assert.equal(text[column('Raw value')], "'@SUM(A1)");
  assert.equal(number[column('Raw value')], '-0.25');
  assert.equal(number[column('Previous value')], '-0.5');
});

test('ledgerToCsv: the fixture report exports every figure, and every query behind it', async () => {
  const { store, runId } = await fixtureReport();
  const [figures, queries] = [await store.listFigures(runId), await store.listQueries(runId)];
  const rows = parseCsv(ledgerToCsv(figures, queries)).slice(1);

  const expected = figures.reduce((all, item) => all + Math.max(1, item.queryKeys.length), 0);
  assert.equal(rows.length, expected);
  assert.ok(rows.every((row) => row.length === LEDGER_CSV_COLUMNS.length));
  // The change in revenue is a formula over two figures, each from its own query.
  assert.deepEqual(
    rows.filter((row) => row[0] === 'revenue_change').map((row) => row[column('Query')]),
    ['q1', 'q2']
  );
  assert.equal(rows.find((row) => row[0] === 'mobile_gave')![column('Tool')], 'ga4_funnel');
});
