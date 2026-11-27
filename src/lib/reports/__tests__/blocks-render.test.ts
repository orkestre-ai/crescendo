import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Tool } from 'ai';
import { BUILTIN_BLOCKS, builtinBlockDefs } from '../blocks/builtin';
import {
  axisLabel,
  chartBars,
  chartLine,
  chartRows,
  compactNumber,
  shortNumber,
  formatChange,
  tableView,
  tidyTicks,
} from '../blocks/charts';
import { renderBlock } from '../blocks/engine';
import { BlockDataError, resolveBlockData, textFields } from '../blocks/resolve';
import type { BlockInstance, ResolvedDataset } from '../blocks/types';
import { validateBlockData } from '../blocks/validate';
import { CONTENT_SECURITY_POLICY, SHELL_SCRIPT } from '../design/shell';
import { renderGalleryHtml, renderReportHtml } from '../render';
import { lintRun } from '../runner';
import { memoryStore, type ReportStore } from '../store';
import { createReportTools } from '../tools';
import type { ReportDataset } from '../types';
import { CHANNELS, DAILY, LEDGER, figure } from './blocks-fixtures';

const block = (key: string) => BUILTIN_BLOCKS.find((b) => b.key === key)!;
const resolved = (dataset: typeof DAILY): ResolvedDataset => ({
  columns: dataset.columns,
  rows: dataset.rows,
  label: dataset.label,
  totalRow: dataset.spec.totalRow === true,
});

// ── References ─────────────────────────────────────────────────────────────

test('resolveBlockData: a figure reference becomes what the ledger holds', () => {
  const out = resolveBlockData({ value: { figure: 'revenue' } }, LEDGER) as {
    value: Record<string, unknown>;
  };
  assert.deepEqual(out.value, {
    value: 5400.5,
    display: '$5,401',
    label: 'revenue',
    unit: 'currency',
    recheckStatus: 'matched',
  });
});

test('resolveBlockData: a dataset reference becomes its columns and rows, with the total marked', () => {
  const out = resolveBlockData({ rows: { dataset: 'channels' } }, LEDGER) as {
    rows: ResolvedDataset;
  };
  assert.deepEqual(out.rows.columns, CHANNELS.columns);
  assert.deepEqual(out.rows.rows, CHANNELS.rows);
  assert.equal(out.rows.totalRow, true);
  const plain = resolveBlockData({ rows: { dataset: 'daily' } }, LEDGER) as {
    rows: ResolvedDataset;
  };
  assert.equal(plain.rows.totalRow, false);
});

test('resolveBlockData: {{fig:key}} in any text becomes the figure as shown, at any depth', () => {
  const out = resolveBlockData(
    {
      items: [
        {
          body: 'We raised {{fig:revenue}} from {{ fig: gifts }} gifts, mostly by {{fig:top_channel}}.',
        },
      ],
    },
    LEDGER
  ) as { items: { body: string }[] };
  assert.equal(out.items[0].body, 'We raised $5,401 from 54 gifts, mostly by Email.');
});

test('resolveBlockData: a reference to nothing is an error, and other values pass through', () => {
  assert.throws(() => resolveBlockData({ v: { figure: 'nope' } }, LEDGER), BlockDataError);
  assert.throws(() => resolveBlockData({ v: { dataset: 'nope' } }, LEDGER), BlockDataError);
  assert.throws(() => resolveBlockData('See {{fig:nope}}', LEDGER), /no figure "nope"/);
  // An object with more than the one key is not a reference.
  assert.deepEqual(resolveBlockData({ a: { figure: 'revenue', label: 'x' }, b: true }, LEDGER), {
    a: { figure: 'revenue', label: 'x' },
    b: true,
  });
});

test('textFields: every text of a block’s data, with its place, skipping references', () => {
  assert.deepEqual(
    textFields({ title: 'A', items: [{ body: 'B', value: { figure: 'revenue' } }] }),
    [
      { path: '/title', text: 'A' },
      { path: '/items/0/body', text: 'B' },
    ]
  );
});

// ── Checking a block's data ────────────────────────────────────────────────

test('validateBlockData: good data for a tile block passes and renders from the ledger', () => {
  const data = {
    tiles: [
      { label: 'Revenue', value: { figure: 'revenue' }, change: { figure: 'change' } },
      { label: 'Visits', value: { figure: 'sessions' }, compact: true },
    ],
  };
  assert.deepEqual(validateBlockData(block('stat_tiles'), data, LEDGER), []);
  const html = renderBlock(block('stat_tiles'), resolveBlockData(data, LEDGER), { mode: 'screen' });
  assert.match(html, /<div class="value">\$5,401<\/div>/);
  assert.match(html, /<b class="down">−37%<\/b>/);
  assert.match(html, /<div class="value">1\.81M<\/div>/);
});

test('stat_tiles: one tile that asks for short numbers sets it for the whole row', () => {
  const tiles = (compact: boolean) => ({
    tiles: [
      { label: 'Revenue', value: { figure: 'big_revenue' }, previous: { figure: 'sessions' } },
      { label: 'Gifts', value: { figure: 'gifts' } },
      { label: 'Visits', value: { figure: 'sessions' }, ...(compact ? { compact } : {}) },
    ],
  });
  const ledger = {
    ...LEDGER,
    figures: [...LEDGER.figures, figure('big_revenue', 412_860, 'currency')],
  };
  const values = (data: unknown) =>
    [
      ...renderBlock(block('stat_tiles'), resolveBlockData(data, ledger), {
        mode: 'print',
      }).matchAll(/<div class="(?:value|delta)">([^<]*)</g),
    ].map((match) => match[1]);

  // Every large number is cut to three figures; a small one is left as it is.
  assert.deepEqual(values(tiles(true)), ['$413k', '1.81M', '54', '1.81M']);
  assert.deepEqual(values(tiles(false)), ['$412,860', '1,812,440', '54', '1,812,440']);
});

test('validateBlockData: a typed number where a figure belongs is refused', () => {
  const issues = validateBlockData(
    block('stat_tiles'),
    { tiles: [{ label: 'Revenue', value: 5400 }] },
    LEDGER
  );
  assert.equal(issues[0].rule, 'figure-ref');
  assert.match(issues[0].message, /\/tiles\/0\/value takes a figure from the ledger/);
  assert.match(issues[0].message, /A number cannot be typed here/);
  const asText = validateBlockData(
    block('stat_tiles'),
    { tiles: [{ label: 'Revenue', value: '$5,400' }] },
    LEDGER
  );
  assert.equal(asText[0].rule, 'figure-ref');
});

test('validateBlockData: a missing figure or dataset is named, with what does exist', () => {
  const tiles = validateBlockData(
    block('stat_tiles'),
    { tiles: [{ label: 'Revenue', value: { figure: 'revenue_2026' } }] },
    LEDGER
  );
  assert.equal(tiles[0].rule, 'figure-missing');
  assert.match(tiles[0].message, /no figure "revenue_2026"/);
  assert.match(tiles[0].message, /Recorded figures: revenue, gifts, change, sessions, top_channel/);

  const table = validateBlockData(
    block('data_table'),
    { rows: { dataset: 'chanels' }, columns: [{ column: 'channel', label: 'Channel' }] },
    LEDGER
  );
  assert.equal(table[0].rule, 'dataset-missing');
  assert.match(table[0].message, /Defined datasets: daily, channels/);

  const prose = validateBlockData(block('prose'), { paragraphs: ['Up {{fig:growth}}.'] }, LEDGER);
  assert.equal(prose[0].rule, 'figure-missing');
  assert.match(prose[0].message, /\{\{fig:growth\}\}/);
});

test('validateBlockData: missing, unknown and mistyped fields are each reported', () => {
  const rules = (data: unknown) =>
    validateBlockData(block('priority_cards'), data, LEDGER).map((issue) => issue.rule);
  assert.deepEqual(rules({}), ['data-required']);
  assert.deepEqual(rules({ items: [] }), ['data-items']);
  assert.deepEqual(rules({ items: [{ heading: 'A' }] }), ['data-required']);
  assert.deepEqual(rules({ items: [{ heading: 'A', body: 'B', colour: 'red' }] }), [
    'data-unknown',
  ]);
  assert.deepEqual(rules({ items: [{ heading: 7, body: 'B' }] }), ['data-type']);
  assert.deepEqual(
    validateBlockData(
      block('line_chart'),
      {
        x: 'date',
        xKind: 'weekly',
        lines: [{ column: 'revenue', label: 'Revenue' }],
        panels: [{ title: 'T', series: { dataset: 'daily' } }],
      },
      LEDGER
    ).map((issue) => issue.rule),
    ['data-enum']
  );
});

test('validateBlockData: a chart that names a column the table lacks says which columns exist', () => {
  const issues = validateBlockData(
    block('bar_chart'),
    {
      title: 'Revenue each day',
      series: { dataset: 'daily' },
      x: 'date',
      xKind: 'date',
      value: { column: 'revenu', label: 'Revenue' },
    },
    LEDGER
  );
  assert.equal(issues[0].rule, 'render');
  assert.match(issues[0].message, /no column "revenu"\. Its columns are: date, revenue, gifts/);
});

test('rendering: a table draws the chosen columns from the dataset, formatted by Crescendo', () => {
  const data = {
    rows: { dataset: 'channels' },
    columns: [
      { column: 'channel', label: 'Channel' },
      { column: 'change', label: 'Change', kind: 'change' },
      { column: 'revenue', label: 'Revenue' },
    ],
  };
  assert.deepEqual(validateBlockData(block('data_table'), data, LEDGER), []);
  const html = renderBlock(block('data_table'), resolveBlockData(data, LEDGER), {
    mode: 'screen',
    currencyCode: 'CAD',
  });
  assert.match(html, /<td>Email<\/td><td class="up">\+25%<\/td><td>\$4,000<\/td>/);
  assert.match(html, /<td>Direct<\/td><td class="down">−3\.1%<\/td><td>\$1,401<\/td>/);
  assert.match(html, /<tr class="total">\s*<td>Total<\/td><td>—<\/td><td>\$5,401<\/td>/);
});

// ── Chart helpers ──────────────────────────────────────────────────────────

test('tidyTicks: steps of 1, 2, 2.5 or 5 times a power of ten, ending on a tick', () => {
  assert.deepEqual(tidyTicks(0, 157_850).ticks, [0, 50_000, 100_000, 150_000, 200_000]);
  assert.deepEqual(tidyTicks(0, 44_374).ticks, [0, 10_000, 20_000, 30_000, 40_000, 50_000]);
  assert.deepEqual(tidyTicks(0, 91_600, 4).ticks, [0, 25_000, 50_000, 75_000, 100_000]);
  assert.deepEqual(tidyTicks(0, 7).ticks, [0, 2, 4, 6, 8]);
  assert.deepEqual(tidyTicks(0, 1).ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(tidyTicks(0, 0.0437).ticks, [0, 0.01, 0.02, 0.03, 0.04, 0.05]);
});

test('tidyTicks: awkward ranges still give clean numbers', () => {
  // No binary dust: 0.30000000000000004 never appears.
  for (const max of [0.3, 0.7, 1.1, 3.3, 0.06, 1234.5678, 9_999_999]) {
    const { ticks, step } = tidyTicks(0, max);
    for (const tick of ticks) assert.equal(tick, Number(tick.toPrecision(12)));
    assert.ok(ticks[ticks.length - 1] >= max, `${max}: the top tick covers the data`);
    assert.ok(ticks.length >= 3 && ticks.length <= 8, `${max}: ${ticks.length} ticks`);
    const lead = step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9));
    assert.ok(
      [1, 2, 2.5, 5].some((s) => Math.abs(lead - s) < 1e-9),
      `${max}: step ${step}`
    );
  }
  // A count has no half: whole steps only.
  assert.deepEqual(tidyTicks(0, 3, 5, true).ticks, [0, 1, 2, 3]);
  assert.deepEqual(tidyTicks(0, 12, 5, true).ticks, [0, 5, 10, 15]);
  // Negative values, a flat series, and nothing at all.
  assert.deepEqual(tidyTicks(-40, 90).ticks, [-50, 0, 50, 100]);
  assert.deepEqual(tidyTicks(250, 250).ticks, [0, 50, 100, 150, 200, 250]);
  assert.deepEqual(tidyTicks(0, 0).ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.throws(() => tidyTicks(0, NaN), /No numbers to scale/);
});

test('compactNumber and formatChange: short forms for labels', () => {
  assert.equal(compactNumber(44_374, 'currency', 'CAD'), '$44.4k');
  assert.equal(compactNumber(157_850, 'currency', 'CAD'), '$158k');
  assert.equal(compactNumber(1_812_440, 'count', null), '1.8M');
  assert.equal(compactNumber(581, 'currency', 'CAD'), '$581');
  assert.equal(compactNumber(-2_500, 'count', null), '−2.5k');
  // A headline keeps three figures at any size, and leaves small numbers alone.
  assert.equal(shortNumber(1_284_300, 'count', null), '1.28M');
  assert.equal(shortNumber(412_860, 'currency', 'CAD'), '$413k');
  assert.equal(shortNumber(17_911, 'currency', 'CAD'), '$17.9k');
  assert.equal(shortNumber(999_960, 'count', null), '1.00M');
  assert.equal(shortNumber(-25_000, 'count', null), '−25.0k');
  assert.equal(shortNumber(2_946, 'count', null), '2,946');
  assert.equal(shortNumber(140.14, 'currency', 'CAD'), '$140.14');
  assert.equal(shortNumber(0.0637, 'percent', null), '6.4%');
  assert.equal(formatChange(0.009), '+0.9%');
  assert.equal(formatChange(-0.046), '−4.6%');
  assert.equal(formatChange(-0.17), '−17%');
  assert.equal(formatChange(1.41), '+141%');
  assert.equal(formatChange(0), '0%');
});

test('axisLabel: dates and hours as a person writes them', () => {
  assert.equal(axisLabel('20261201', 'date'), '1 Dec');
  assert.equal(axisLabel('2026-12-01', 'date', true), 'Tue 1 Dec 2026');
  // Under an axis every hour has the same short form; with room, the ends of the clock are words.
  assert.equal(axisLabel('00', 'hour'), '12am');
  assert.equal(axisLabel(12, 'hour'), '12pm');
  assert.equal(axisLabel('00', 'hour', true), 'midnight');
  assert.equal(axisLabel(12, 'hour', true), 'noon');
  assert.equal(axisLabel('17', 'hour'), '5pm');
  assert.equal(axisLabel('not a date', 'date'), 'not a date');
});

const series47: ResolvedDataset = {
  label: 'Daily',
  totalRow: false,
  columns: [
    { key: 'date', format: 'text' },
    { key: 'revenue', format: 'currency' },
  ],
  rows: Array.from({ length: 47 }, (_, i) => [
    new Date(Date.UTC(2025, 10, 15 + i)).toISOString().slice(0, 10).replace(/-/g, ''),
    i === 17 ? 44_374 : i === 46 ? 157_850 : 1_000 + i * 37,
  ]),
};

test('chartBars: 47 days give 47 bars, weekly labels and a tidy money axis', () => {
  const chart = chartBars(series47, {
    width: 860,
    height: 300,
    x: 'date',
    value: { column: 'revenue', label: 'Revenue' },
    kind: 'date',
    highlights: [
      { x: '20251202', label: 'Giving Tuesday' },
      { x: '2025-12-31', label: '31 Dec' },
    ],
    currencyCode: 'CAD',
  });
  assert.equal(chart.bars.length, 47);
  assert.equal(chart.hits.length, 47);
  assert.deepEqual(
    chart.yTicks.map((tick) => tick.label),
    ['$0', '$50k', '$100k', '$150k', '$200k']
  );
  assert.deepEqual(
    chart.xTicks.map((tick) => tick.label),
    ['15 Nov', '22 Nov', '29 Nov', '6 Dec', '13 Dec', '20 Dec', '27 Dec', '31 Dec']
  );
  // The value after each name comes from the table, not from the block's data.
  assert.deepEqual(chart.labels.map((label) => label.text).sort(), [
    '31 Dec $158k',
    'Giving Tuesday $44.4k',
  ]);
  // The label on the last bar is pulled in from the right edge.
  assert.equal(chart.labels.find((label) => label.text.startsWith('31 Dec'))!.anchor, 'end');
  assert.match(chart.hits[17].tip, /^Tue 2 Dec 2025\nRevenue: \$44,374$/);
  assert.match(chart.summary, /The highest is Wed 31 Dec 2025 at \$157,850\./);
  // Everything stays inside the drawing.
  for (const tick of chart.yTicks) assert.ok(tick.at >= chart.top && tick.at <= chart.bottom);
});

test('chartBars: labels never sit on top of each other, and a narrow chart thins its dates', () => {
  const chart = chartBars(series47, {
    width: 340,
    height: 240,
    x: 'date',
    value: { column: 'revenue', label: 'Revenue' },
    kind: 'date',
    highlights: [
      { x: '20251229', label: 'Monday' },
      { x: '20251230', label: 'Tuesday' },
      { x: '20251231', label: 'Wednesday' },
    ],
    currencyCode: 'CAD',
  });
  const boxes = chart.labels.map((label) => {
    const width = label.text.length * 7;
    const from =
      label.anchor === 'end'
        ? label.x - width
        : label.anchor === 'start'
          ? label.x
          : label.x - width / 2;
    return { from, to: from + width, y: label.y };
  });
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart = a.to <= b.from || b.to <= a.from || Math.abs(a.y - b.y) >= 12;
      assert.ok(apart, 'two labels overlap');
    }
  }
  assert.ok(chart.xTicks.length <= 5, `${chart.xTicks.length} date labels on a phone`);
  const ticks = chart.xTicks.map((tick) => tick.at);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] - ticks[i - 1] >= 40);
});

test('chartBars: with no highlight the tallest bar is labelled; a total row is not a bar', () => {
  const chart = chartBars(resolved(CHANNELS), {
    width: 340,
    height: 240,
    x: 'channel',
    value: { column: 'revenue', label: 'Revenue' },
    kind: 'category',
    currencyCode: 'CAD',
  });
  assert.equal(chart.bars.length, 2);
  assert.deepEqual(
    chart.labels.map((label) => label.text),
    ['$4k']
  );
});

test('chartLine: two lines over 24 hours, with hour ticks and a value at the end of each', () => {
  const hours: ResolvedDataset = {
    label: 'Hourly',
    totalRow: false,
    columns: [
      { key: 'hour', format: 'text' },
      { key: 'now', format: 'currency' },
      { key: 'before', format: 'currency' },
    ],
    rows: Array.from({ length: 24 }, (_, h) => [
      String(h).padStart(2, '0'),
      (h + 1) * 2000,
      (h + 1) * 1990,
    ]),
  };
  const opts = {
    x: 'hour',
    lines: [
      { column: 'now', label: '2026' },
      { column: 'before', label: '2025' },
    ],
    kind: 'hour',
    currencyCode: 'CAD',
  };
  const wide = chartLine(hours, { ...opts, width: 860, height: 300 });
  assert.deepEqual(
    wide.xTicks.map((tick) => tick.label),
    ['12am', '6am', '12pm', '6pm', '11pm']
  );
  assert.deepEqual(
    wide.yTicks.map((tick) => tick.label),
    ['$0', '$10k', '$20k', '$30k', '$40k', '$50k']
  );
  assert.equal(wide.series.length, 2);
  assert.match(wide.series[0].path, /^M[\d.]+,[\d.]+ L/);
  assert.equal(wide.series[0].path.split('L').length, 24);
  // On a wide chart the end of a line carries its name and its value.
  assert.equal(wide.series[0].end!.text, '2026 $48k');
  // The two lines end $240 apart: their labels are moved clear of each other.
  assert.ok(Math.abs(wide.series[0].end!.y - wide.series[1].end!.y) >= 13);
  assert.ok(wide.series[0].end!.y < wide.series[1].end!.y, 'the higher line keeps the upper label');
  assert.equal(wide.hits.length, 24);
  assert.equal(wide.hits[12].tip, 'noon\n2026: $26,000\n2025: $25,870');
  assert.equal(wide.hits[12].dots.split(',').length, 2);

  const narrow = chartLine(hours, { ...opts, width: 340, height: 240 });
  assert.equal(narrow.series[0].end!.text, '$48k');
  assert.ok(narrow.right <= 340 - 40, 'room is kept to the right of the plot for the end values');
  // First label starts at the axis, last ends at it: neither hangs outside.
  assert.equal(narrow.xTicks[0].anchor, 'start');
  assert.equal(narrow.xTicks[narrow.xTicks.length - 1].anchor, 'end');

  // At the width of a printed half column the quarters of the day still fit,
  // 10 units or more apart, and 6pm is not given up to make room for 11pm.
  const half = chartLine(hours, { ...opts, width: 306, height: 216 });
  assert.deepEqual(
    half.xTicks.map((tick) => tick.label),
    ['12am', '6am', '12pm', '6pm']
  );
});

test('chartLine: a gap in the data lifts the pen, and an empty table is an error', () => {
  const gappy: ResolvedDataset = {
    label: 'Gappy',
    totalRow: false,
    columns: [
      { key: 'day', format: 'text' },
      { key: 'v', format: 'count' },
    ],
    rows: [
      ['Mon', 1],
      ['Tue', null],
      ['Wed', 3],
      ['Thu', 4],
    ],
  };
  const chart = chartLine(gappy, {
    width: 340,
    height: 240,
    x: 'day',
    lines: [{ column: 'v', label: 'Visits' }],
    currencyCode: null,
  });
  assert.equal((chart.series[0].path.match(/M/g) ?? []).length, 2);
  assert.throws(
    () =>
      chartLine(
        { ...gappy, rows: [] },
        {
          width: 340,
          height: 240,
          x: 'day',
          lines: [{ column: 'v', label: 'V' }],
          currencyCode: null,
        }
      ),
    /the table has no rows/
  );
  assert.throws(
    () =>
      chartLine('not a table', {
        width: 340,
        height: 240,
        x: 'day',
        lines: [],
        currencyCode: null,
      }),
    /needs a table from the ledger/
  );
});

test('chartRows: bar lengths as whole percents, with the share of the step before', () => {
  const funnel: ResolvedDataset = {
    label: 'Funnel',
    totalRow: false,
    columns: [
      { key: 'step', format: 'text' },
      { key: 'desktop', format: 'count' },
      { key: 'mobile', format: 'count' },
    ],
    rows: [
      ['Viewed', 4000, 5000],
      ['Started', 2000, 3000],
      ['Gave', 100, 30],
    ],
  };
  const chart = chartRows(funnel, {
    label: 'step',
    series: [
      { column: 'desktop', label: 'Desktop' },
      { column: 'mobile', label: 'Mobile' },
    ],
    share: 'previous',
    currencyCode: null,
  });
  assert.deepEqual(chart.rows[0].bars, [
    { cls: 's1', width: 44, text: '4,000 desktop' },
    { cls: 's2', width: 55, text: '5,000 mobile' },
  ]);
  assert.equal(chart.rows[1].bars[0].text, '2,000 desktop (50%)');
  assert.equal(chart.rows[2].bars[0].text, '100 desktop (5.0%)');
  assert.equal(chart.rows[2].bars[1].text, '30 mobile (1.0%)');
  // A small value still shows as a sliver, and widths are classes w-0 to w-100.
  for (const row of chart.rows) {
    for (const bar of row.bars)
      assert.ok(Number.isInteger(bar.width) && bar.width >= 1 && bar.width <= 55);
  }
});

test('tableView: the x column first, written as a date; numbers by their column', () => {
  const view = tableView(resolved(DAILY), {
    columns: [{ column: 'revenue', label: 'Revenue' }],
    x: 'date',
    xKind: 'date',
    currencyCode: 'CAD',
  });
  assert.deepEqual(
    view.head.map((head) => head.label),
    ['Date', 'Revenue']
  );
  assert.deepEqual(
    view.rows[0].cells.map((cell) => cell.text),
    ['Mon 23 Nov 2026', '$1,201']
  );
  assert.throws(
    () => tableView(resolved(DAILY), { columns: [], currencyCode: null }),
    /at least one column/
  );
});

test('tableView: a currency column is written one way, whole units or cents', () => {
  const money = (dataset: ReportDataset) =>
    tableView(resolved(dataset), {
      columns: [{ column: 'revenue', label: 'Revenue' }],
      currencyCode: 'CAD',
    }).rows.map((row) => row.cells[0].text);
  // One amount reaches a thousand, so none shows cents.
  assert.deepEqual(money(DAILY), ['$1,201', '$3,400', '$800']);
  // Every amount is under a thousand, so all show cents.
  const small = { ...DAILY, rows: DAILY.rows.map((row) => [row[0], Number(row[1]) / 10, row[2]]) };
  assert.deepEqual(money(small), ['$120.05', '$340.00', '$80.00']);
});

// ── The reporter's block tools ─────────────────────────────────────────────

type Result = Record<string, unknown> & { error?: string };

async function toolsFor(store: ReportStore) {
  const run = await store.createRun({
    definitionId: null,
    definitionSnapshot: {
      key: 't',
      name: 'Test',
      prompt: '',
      enabledTools: [],
      maxSteps: 10,
      maxMinutes: 10,
    },
    title: 'Test report',
    preparedBy: null,
    inputs: {},
  });
  for (const figure of LEDGER.figures) await store.upsertFigure({ ...figure, runId: run.id });
  for (const dataset of LEDGER.datasets) await store.upsertDataset({ ...dataset, runId: run.id });
  const { tools, signals } = createReportTools(store, run.id, {}, { currencyCode: 'CAD' });
  let n = 0;
  const call = async (name: string, input: unknown): Promise<Result> =>
    (await (tools[name] as Tool).execute!(input, {
      toolCallId: `c${++n}`,
      messages: [],
    })) as Result;
  const blocks = async () => (await store.getRun(run.id))!.blocks as BlockInstance[];
  return { runId: run.id, call, blocks, signals };
}

const PROSE = { block: 'prose', data: { paragraphs: ['We raised {{fig:revenue}}.'] } };

test('list_blocks: every block that is not disabled, with its data shape', async () => {
  const defs = builtinBlockDefs();
  defs.find((def) => def.key === 'flag')!.status = 'disabled';
  const { call } = await toolsFor(memoryStore({ blockDefs: defs }));
  const out = await call('list_blocks', {});
  const listed = out.blocks as { key: string; description: string; dataSchema: unknown }[];
  assert.equal(listed.length, 10);
  assert.ok(!listed.some((item) => item.key === 'flag'));
  const tiles = listed.find((item) => item.key === 'stat_tiles')!;
  assert.ok(tiles.description.length > 20);
  assert.match(JSON.stringify(tiles.dataSchema), /"x-ref":"figure"/);
  assert.match(String(out.references), /\{\{fig:<key>\}\}/);
});

test('add_block: places blocks in order, records the version, and honours "after"', async () => {
  const { call, blocks } = await toolsFor(memoryStore());
  assert.deepEqual(await call('add_block', PROSE), { id: 'b1', position: 1, blocks: 1 });
  assert.deepEqual(await call('add_block', { block: 'flag', data: { text: 'Sampled.' } }), {
    id: 'b2',
    position: 2,
    blocks: 2,
  });
  const middle = await call('add_block', {
    block: 'section',
    data: { heading: 'Channels' },
    after: 'b1',
  });
  assert.deepEqual(middle, { id: 'b3', position: 2, blocks: 3 });
  assert.deepEqual(
    (await blocks()).map((b) => [b.id, b.block, b.version]),
    [
      ['b1', 'prose', 1],
      ['b3', 'section', 1],
      ['b2', 'flag', 1],
    ]
  );
  // The data is stored as given: references, not numbers.
  assert.deepEqual((await blocks())[0].data, PROSE.data);
});

test('add_block: issues go back to the model as text, and nothing is added', async () => {
  const { call, blocks } = await toolsFor(memoryStore());
  const missing = await call('add_block', {
    block: 'stat_tiles',
    data: { tiles: [{ label: 'Revenue', value: { figure: 'revenue_2026' } }] },
  });
  assert.match(missing.error!, /The block was not added\. Fix this and call the tool again:/);
  assert.match(missing.error!, /no figure "revenue_2026"\. Recorded figures: revenue, gifts/);

  const typed = await call('add_block', {
    block: 'stat_tiles',
    data: { tiles: [{ label: 'Revenue', value: 5400 }] },
  });
  assert.match(typed.error!, /A number cannot be typed here/);

  assert.match(
    (await call('add_block', { block: 'pie_chart', data: {} })).error!,
    /no block "pie_chart"\. Blocks: report_header, section/
  );
  assert.match(
    (await call('add_block', { ...PROSE, after: 'b9' })).error!,
    /no block with id "b9"/
  );
  assert.deepEqual(await blocks(), []);

  // The model fixes the key and tries again.
  const fixed = await call('add_block', {
    block: 'stat_tiles',
    data: { tiles: [{ label: 'Revenue', value: { figure: 'revenue' } }] },
  });
  assert.equal(fixed.id, 'b1');
});

test('add_block: a disabled block cannot be placed', async () => {
  const defs = builtinBlockDefs();
  defs.find((def) => def.key === 'prose')!.status = 'disabled';
  const { call } = await toolsFor(memoryStore({ blockDefs: defs }));
  assert.match((await call('add_block', PROSE)).error!, /no block "prose"/);
});

test('update_block and remove_block: change one block and leave the others', async () => {
  const { call, blocks } = await toolsFor(memoryStore());
  await call('add_block', PROSE);
  await call('add_block', { block: 'flag', data: { text: 'Sampled.' } });

  const bad = await call('update_block', { id: 'b1', data: { paragraphs: ['Up {{fig:nope}}.'] } });
  assert.match(bad.error!, /The block was not updated/);
  assert.deepEqual((await blocks())[0].data, PROSE.data);

  assert.deepEqual(await call('update_block', { id: 'b1', data: { paragraphs: ['Revised.'] } }), {
    id: 'b1',
    ok: true,
  });
  assert.deepEqual((await blocks())[0].data, { paragraphs: ['Revised.'] });
  assert.match(
    (await call('update_block', { id: 'b7', data: {} })).error!,
    /no block with id "b7"/
  );

  assert.deepEqual(await call('remove_block', { id: 'b1' }), { id: 'b1', blocks: 1 });
  assert.deepEqual(
    (await blocks()).map((b) => b.id),
    ['b2']
  );
  assert.match((await call('remove_block', { id: 'b1' })).error!, /no block with id "b1"/);
  // Ids are never reused.
  assert.equal((await call('add_block', PROSE)).id, 'b3');
});

test('finish_report: refused while the report has no blocks, accepted once it has one', async () => {
  const { call, signals } = await toolsFor(memoryStore());
  const refused = await call('finish_report', { summary: 'Done.' });
  assert.match(refused.error!, /The report has no blocks yet/);
  assert.equal(signals.finish, undefined);

  await call('add_block', PROSE);
  assert.deepEqual(await call('finish_report', { summary: 'Done.' }), { ok: true });
  assert.deepEqual(signals.finish, { summary: 'Done.' });
});

// ── The document ───────────────────────────────────────────────────────────

async function reportWith(blocks: BlockInstance[]) {
  const store = memoryStore();
  const { runId } = await toolsFor(store);
  await store.updateRun(runId, { blocks, currencyCode: 'CAD' });
  return { store, runId };
}

const DOCUMENT: BlockInstance[] = [
  { id: 'b1', block: 'section', version: 1, data: { heading: 'Revenue & gifts' } },
  { id: 'b2', block: 'prose', version: 1, data: { paragraphs: ['We raised {{fig:revenue}}.'] } },
  { id: 'b3', block: 'flag', version: 1, data: { text: 'A hidden caution.' }, hidden: true },
  {
    id: 'b4',
    block: 'data_table',
    version: 1,
    data: { rows: { dataset: 'channels' }, columns: [{ column: 'channel', label: 'Channel' }] },
  },
];

test('renderReportHtml: one self-contained document, blocks in order, numbers from the ledger', async () => {
  const { store, runId } = await reportWith(DOCUMENT);
  const html = await renderReportHtml(runId, { mode: 'screen', store });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<title>Test report<\/title>/);
  assert.match(html, /<p>We raised \$5,401\.<\/p>/);
  assert.match(html, /<h2>Revenue &amp; gifts<\/h2>/);
  const order = ['b1', 'b2', 'b4'].map((id) => html.indexOf(`data-block-id="${id}"`));
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2]);

  // A hidden block is left out, with its styles.
  assert.doesNotMatch(html, /A hidden caution/);
  assert.doesNotMatch(html, /\.blk-flag/);
  // Each block's styles are there once.
  assert.equal(html.split('.blk-section {').length - 1, 1);

  // Nothing is loaded from anywhere.
  assert.doesNotMatch(html, /<link|src="http|url\(http|@import/);
  assert.match(html, /@font-face \{ font-family: "Inter";[^}]*url\(data:font\/woff2;base64,/);
  assert.match(html, /@font-face \{ font-family: "Source Serif 4";/);
});

test('renderReportHtml: the policy allows inline styles, data: images and fonts, and one script by hash', async () => {
  const { store, runId } = await reportWith(DOCUMENT);
  const html = await renderReportHtml(runId, { mode: 'screen', store });
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)![1];
  assert.equal(policy, CONTENT_SECURITY_POLICY);
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /style-src 'unsafe-inline'/);
  assert.match(policy, /img-src data:/);
  assert.match(policy, /font-src data:/);
  assert.match(policy, /script-src 'sha256-[A-Za-z0-9+/]{43}='/);
  assert.doesNotMatch(policy, /script-src[^;]*unsafe/);

  const scripts = html.match(/<script[\s\S]*?<\/script>/g) ?? [];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0], `<script>${SHELL_SCRIPT}</script>`);
});

test('renderReportHtml: print mode is light, runs no script and carries the print rules', async () => {
  const { store, runId } = await reportWith(DOCUMENT);
  const html = await renderReportHtml(runId, { mode: 'print', store });
  assert.match(html, /<html lang="en" data-theme="light" data-mode="print">/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /id="theme"/);
  assert.match(html, /@page \{ size: Letter; margin: 18mm; \}/);
  assert.match(html, /\.blk \{[^}]*break-inside: avoid;/);
  assert.match(html, /\.blk h1, \.blk h2, \.blk h3 \{ break-after: avoid; \}/);
  assert.match(html, /\.blk thead \{ display: table-header-group; \}/);
  assert.match(html, /\.blk:has\(> \.table-wrap\) \{ break-inside: auto; \}/);
  // The screen document has the same rules under @media print, for a person who prints it.
  const screen = await renderReportHtml(runId, { mode: 'screen', store });
  assert.match(screen, /@media print \{/);
  assert.match(screen, /:root:not\(\[data-theme="light"\]\)/);
  assert.match(screen, /:root\[data-theme="dark"\]/);
});

test('renderReportHtml: a block that cannot be drawn is named, and the rest still render', async () => {
  const { store, runId } = await reportWith([
    { id: 'b1', block: 'prose', version: 1, data: { paragraphs: ['Up {{fig:gone}}.'] } },
    { id: 'b2', block: 'no_such_block', version: 1, data: {} },
    { id: 'b3', block: 'prose', version: 1, data: { paragraphs: ['Still here.'] } },
  ]);
  const html = await renderReportHtml(runId, { mode: 'screen', store });
  assert.match(
    html,
    /This part of the report could not be shown: There is no figure &quot;gone&quot;/
  );
  assert.match(html, /The block &quot;no_such_block&quot; is not available\./);
  assert.match(html, /<p>Still here\.<\/p>/);
});

test('renderReportHtml: a run with no blocks says so; an unknown run is an error', async () => {
  const { store, runId } = await reportWith([]);
  assert.match(
    await renderReportHtml(runId, { mode: 'screen', store }),
    /This report has no document yet\./
  );
  await assert.rejects(renderReportHtml('nope', { mode: 'screen', store }), /No report run/);
});

test('renderReportHtml: a block is drawn with the version the run recorded', async () => {
  const defs = builtinBlockDefs();
  const prose = defs.find((def) => def.key === 'prose')!;
  prose.isCurrent = false;
  defs.push({
    ...prose,
    version: 2,
    isCurrent: true,
    template: '<p class="v2">{{ data.paragraphs[0] }}</p>',
  });
  const store = memoryStore({ blockDefs: defs });
  const { runId } = await toolsFor(store);
  await store.updateRun(runId, {
    blocks: [
      { id: 'b1', block: 'prose', version: 1, data: { paragraphs: ['Old.'] } },
      { id: 'b2', block: 'prose', version: 2, data: { paragraphs: ['New.'] } },
    ],
  });
  const html = await renderReportHtml(runId, { mode: 'screen', store });
  assert.match(html, /<p>Old\.<\/p>/);
  assert.match(html, /<p class="v2">New\.<\/p>/);
});

test('renderReportHtml: styles that no longer pass the rules are left out', async () => {
  const defs = builtinBlockDefs();
  defs.find((def) => def.key === 'prose')!.css =
    'body { display: none; } </style><script>x()</script>';
  const store = memoryStore({ blockDefs: defs });
  const { runId } = await toolsFor(store);
  await store.updateRun(runId, {
    blocks: [{ id: 'b1', block: 'prose', version: 1, data: { paragraphs: ['Text.'] } }],
  });
  const html = await renderReportHtml(runId, { mode: 'screen', store });
  assert.doesNotMatch(html, /display: none; \} <\/style>/);
  assert.match(html, /<p>Text\.<\/p>/);
});

test('renderGalleryHtml: every current block that is not disabled, with its sample data', async () => {
  const defs = builtinBlockDefs();
  defs.find((def) => def.key === 'flag')!.status = 'disabled';
  const html = await renderGalleryHtml({ mode: 'screen', store: memoryStore({ blockDefs: defs }) });
  for (const def of defs) {
    const shown = html.includes(`data-block-id="gallery-${def.key}"`);
    assert.equal(shown, def.key !== 'flag', def.key);
  }
  assert.match(html, /<code>stat_tiles<\/code>/);
  const print = await renderGalleryHtml({ mode: 'print', store: memoryStore() });
  assert.match(print, /data-mode="print"/);
  assert.equal((print.match(/class="blk blk-/g) ?? []).length, 11);
});

test('lintRun: typed numbers are added to the run’s warnings, beside the recheck’s', async () => {
  const { store, runId } = await reportWith([
    {
      id: 'b1',
      block: 'prose',
      version: 1,
      data: { paragraphs: ['Revenue fell 37% to {{fig:revenue}}, from 412 gifts.'] },
    },
  ]);
  await store.updateRun(runId, {
    warnings: [{ kind: 'recheck', message: 'Query q2 could not be run again.' }],
  });

  assert.equal(await lintRun(runId, store), 1);
  let warnings = (await store.getRun(runId))!.warnings;
  assert.deepEqual(
    warnings.map((warning) => warning.kind),
    ['recheck', 'prose']
  );
  assert.match(warnings[1].message, /"412" in block b1 \(prose, \/paragraphs\/0\)/);

  // Linting again replaces the prose warnings and keeps the others.
  await store.updateRun(runId, {
    blocks: [{ id: 'b1', block: 'prose', version: 1, data: { paragraphs: ['Revenue fell 37%.'] } }],
  });
  assert.equal(await lintRun(runId, store), 0);
  warnings = (await store.getRun(runId))!.warnings;
  assert.deepEqual(warnings, [{ kind: 'recheck', message: 'Query q2 could not be run again.' }]);
});
