import { sampleDays, sampleNoise } from '../blocks/builtin/sample';
import type { BlockInstance } from '../blocks/types';
import { formatFigure } from '../ledger';
import { memoryStore, type ReportStore } from '../store';
import type { Cell, FigureSource, ReportDataset, Unit } from '../types';

/**
 * A whole report in memory, for the PDF test and for looking at the printed
 * pages: every built-in block, a table of 60 rows, long prose, and one
 * hidden block. Every name and number is invented.
 */

const CURRENCY = 'CAD';

type FigureSeed = [key: string, label: string, unit: Unit, value: number, source: FigureSource];

const sum = (query: string, column: string): FigureSource => ({
  kind: 'aggregate',
  query,
  column,
  agg: 'sum',
});
const change = (now: string, before: string): FigureSource => ({
  kind: 'formula',
  expr: '(now - before) / before',
  refs: { now, before },
});

const FIGURES: FigureSeed[] = [
  ['revenue', 'Online revenue, 15 Nov to 31 Dec 2025', 'currency', 412_860, sum('q1', 'revenue')],
  [
    'revenue_before',
    'Online revenue, 15 Nov to 31 Dec 2024',
    'currency',
    388_140,
    sum('q2', 'revenue'),
  ],
  [
    'revenue_change',
    'Change in online revenue',
    'percent',
    0.0637,
    change('revenue', 'revenue_before'),
  ],
  ['gifts', 'Gifts, 15 Nov to 31 Dec 2025', 'count', 2_946, sum('q1', 'gifts')],
  ['gifts_before', 'Gifts, 15 Nov to 31 Dec 2024', 'count', 3_102, sum('q2', 'gifts')],
  ['gifts_change', 'Change in gifts', 'percent', -0.0503, change('gifts', 'gifts_before')],
  [
    'average_gift',
    'Average gift, 2025',
    'currency',
    140.14,
    { kind: 'formula', expr: 'revenue / gifts', refs: { revenue: 'revenue', gifts: 'gifts' } },
  ],
  [
    'average_before',
    'Average gift, 2024',
    'currency',
    125.13,
    {
      kind: 'formula',
      expr: 'revenue / gifts',
      refs: { revenue: 'revenue_before', gifts: 'gifts_before' },
    },
  ],
  [
    'average_change',
    'Change in average gift',
    'percent',
    0.12,
    change('average_gift', 'average_before'),
  ],
  ['sessions', 'Visits, 15 Nov to 31 Dec 2025', 'count', 1_284_300, sum('q1', 'sessions')],
  ['sessions_before', 'Visits, 15 Nov to 31 Dec 2024', 'count', 1_561_900, sum('q2', 'sessions')],
  [
    'sessions_change',
    'Change in visits',
    'percent',
    -0.1777,
    change('sessions', 'sessions_before'),
  ],
  [
    'giving_tuesday',
    'Revenue on Giving Tuesday 2025',
    'currency',
    17_911,
    {
      kind: 'cell',
      query: 'q1',
      column: 'revenue',
      where: [{ column: 'date', op: '=', value: '20251202' }],
    },
  ],
  [
    'mobile_finish',
    'Share of phone visitors who started the form and gave',
    'percent',
    0.0166,
    {
      kind: 'formula',
      expr: 'gave / started',
      refs: { gave: 'mobile_gave', started: 'mobile_started' },
    },
  ],
  [
    'mobile_gave',
    'Phone visitors who gave',
    'count',
    41,
    {
      kind: 'cell',
      query: 'q5',
      column: 'mobile',
      where: [{ column: 'step', op: '=', value: 'Gave' }],
    },
  ],
  [
    'mobile_started',
    'Phone visitors who started the form',
    'count',
    2_466,
    {
      kind: 'cell',
      query: 'q5',
      column: 'mobile',
      where: [{ column: 'step', op: '=', value: 'Started the form' }],
    },
  ],
  [
    'emails_sent',
    'Appeal emails sent',
    'count',
    48_200,
    { kind: 'stated', value: 48_200, reason: 'From the email platform; not in Google Analytics.' },
  ],
];

// The queries each figure rests on, following formulas back to their figures.
function queryKeys(key: string): string[] {
  const source = FIGURES.find((figure) => figure[0] === key)![4];
  if (source.kind === 'stated') return [];
  if (source.kind !== 'formula') return [source.query];
  return [...new Set(Object.values(source.refs).flatMap(queryKeys))].sort();
}

const table = (
  key: string,
  label: string,
  from: string,
  columns: [key: string, format: Unit][],
  rows: Cell[][],
  totalRow = false
): ReportDataset => ({
  runId: '',
  key,
  label,
  spec: { from, select: columns.map(([column]) => ({ column })), totalRow },
  columns: columns.map(([column, format]) => ({ key: column, format })),
  rows,
});

function daily(): ReportDataset {
  const noise = sampleNoise(7);
  let total = 0;
  let totalBefore = 0;
  const rows = sampleDays('2025-11-15', 47).map((day, i): Cell[] => {
    const peak = day === '20251202' ? 5.2 : day === '20251231' ? 9 : i > 40 ? 2.4 : 1;
    const revenue = Math.round((2_600 + noise() * 2_800) * peak);
    total += revenue;
    totalBefore += Math.round(revenue * (0.78 + noise() * 0.34));
    return [day, revenue, Math.round(revenue / (118 + noise() * 40)), total, totalBefore];
  });
  return table(
    'daily',
    'Revenue and gifts each day, 15 Nov to 31 Dec 2025',
    'q1',
    [
      ['date', 'text'],
      ['revenue', 'currency'],
      ['gifts', 'count'],
      ['total', 'currency'],
      ['total_before', 'currency'],
    ],
    rows
  );
}

function hours(key: string, label: string, seed: number, scale: number): ReportDataset {
  const noise = sampleNoise(seed);
  const shape = [
    1, 1, 0.5, 0.5, 1, 2, 4, 6, 9, 10, 10, 11, 12, 11, 10, 9, 10, 12, 15, 14, 11, 7, 4, 2,
  ];
  let now = 0;
  let before = 0;
  const rows = shape.map((weight, hour): Cell[] => {
    now += Math.round(weight * scale * (0.7 + noise() * 0.6));
    before += Math.round(weight * scale * 0.88 * (0.7 + noise() * 0.6));
    return [String(hour).padStart(2, '0'), now, before];
  });
  return table(
    key,
    label,
    'q3',
    [
      ['hour', 'text'],
      ['revenue_now', 'currency'],
      ['revenue_before', 'currency'],
    ],
    rows
  );
}

const CHANNELS = table(
  'channels',
  'Revenue and gifts by channel, 2025 against 2024',
  'q4',
  [
    ['channel', 'text'],
    ['revenue', 'currency'],
    ['gifts', 'count'],
    ['revenue_before', 'currency'],
    ['change', 'percent'],
  ],
  [
    ['Paid Search', 121_480, 842, 138_260, -0.1214],
    ['Direct', 96_310, 731, 104_920, -0.0821],
    ['Organic Search', 88_240, 512, 74_180, 0.1895],
    ['Email', 41_620, 388, 22_940, 0.8143],
    ['Referral', 24_870, 176, 12_310, 1.0203],
    ['Paid Social', 14_260, 121, 15_480, -0.0788],
    ['Organic Social', 9_840, 74, 11_260, -0.1261],
    ['Display', 6_120, 38, 3_940, 0.5533],
    ['AI Assistant', 4_380, 29, null, null],
    ['Affiliates', 2_910, 17, 2_480, 0.1734],
    ['Organic Video', 1_640, 11, 1_210, 0.3554],
    ['Unassigned', 1_190, 7, 1_160, 0.0259],
    ['Total', 412_860, 2_946, 388_140, 0.0637],
  ],
  true
);

// Sixty landing pages: long enough to run over three printed pages.
function pages(): ReportDataset {
  const noise = sampleNoise(41);
  const areas = ['appeal', 'stories', 'gift-guide', 'monthly', 'news', 'events'];
  const rows: Cell[][] = Array.from({ length: 60 }, (_, i) => {
    const sessions = Math.round(38_000 / (i + 1.4) + noise() * 900);
    const gifts = Math.max(1, Math.round(sessions * (0.004 + noise() * 0.02)));
    const revenue = Math.round(gifts * (70 + noise() * 160));
    return [
      `/${areas[i % areas.length]}/${i < 6 ? 'year-end' : `page-${String(i + 1).padStart(2, '0')}`}`,
      sessions,
      gifts,
      revenue,
      gifts / sessions,
    ];
  });
  const total = (column: number) => rows.reduce((all, row) => all + (row[column] as number), 0);
  rows.push(['Total', total(1), total(2), total(3), total(2) / total(1)]);
  return table(
    'pages',
    'Landing pages that led to a gift, 15 Nov to 31 Dec 2025',
    'q6',
    [
      ['page', 'text'],
      ['sessions', 'count'],
      ['gifts', 'count'],
      ['revenue', 'currency'],
      ['rate', 'percent'],
    ],
    rows,
    true
  );
}

const FUNNEL = table(
  'funnel',
  'Donation form funnel by device',
  'q5',
  [
    ['step', 'text'],
    ['desktop', 'count'],
    ['mobile', 'count'],
  ],
  [
    ['Viewed the form', 3_640, 4_180],
    ['Started the form', 1_712, 2_466],
    ['Gave', 118, 41],
  ]
);

const YEARS = [
  { column: 'revenue_now', label: '2025' },
  { column: 'revenue_before', label: '2024' },
];

const BLOCKS: [block: string, data: unknown, hidden?: boolean][] = [
  [
    'report_header',
    {
      organisation: 'Example Organisation',
      reportName: 'Year-end giving review',
      title: 'Online giving rose 6% this year-end, on fewer and larger gifts',
      dek: 'What Google Analytics shows about the 2025 year-end campaign, from 15 November to 31 December, set against the same weeks of 2024.',
      date: '6 January 2026',
      preparedBy: 'Sam Rivera',
      timeZone: 'America/Toronto',
      currency: 'Canadian dollars',
    },
  ],
  ['section', { heading: 'Five things to act on' }],
  [
    'priority_cards',
    {
      items: [
        {
          heading: 'Online giving this year-end is ahead of last year',
          body: 'Revenue reached {{fig:revenue}}, against {{fig:revenue_before}} in the same weeks of 2024. There were fewer gifts, and each was larger: the average gift rose to {{fig:average_gift}}.',
          check: 'whether your own donation records show the same rise.',
        },
        {
          heading: 'The donation form loses most people on a phone',
          body: 'Of the phone visitors who started the main form, {{fig:mobile_finish}} went on to give. On a computer the share is about four times higher.',
          check: 'make a test gift on a phone, and watch where it slows down.',
        },
        {
          heading: 'Email brought in almost twice as much as last year',
          body: 'Email is the channel that grew most in dollars. The appeal went to {{fig:emails_sent}} addresses, and the gifts it led to were larger than the average.',
          check: 'which of the appeal emails the gifts followed.',
        },
        {
          heading: 'Paid search fell, and it is still the largest channel',
          body: 'Revenue from paid search fell by about an eighth. It remains the largest single source of online gifts, so a small change in it moves the total.',
          check: 'whether the ad budget or the bidding changed in December.',
        },
        {
          heading: 'Giving Tuesday is now a real second peak',
          body: 'Giving Tuesday raised {{fig:giving_tuesday}} in one day, the highest day of the campaign outside the last week of December.',
        },
      ],
    },
  ],
  [
    'section',
    {
      heading: 'This campaign against last year',
      lede: '15 November to 31 December 2025 against the same dates in 2024.',
    },
  ],
  [
    'stat_tiles',
    {
      tiles: [
        {
          label: 'Online revenue',
          value: { figure: 'revenue' },
          previousLabel: '2024',
          previous: { figure: 'revenue_before' },
          change: { figure: 'revenue_change' },
        },
        {
          label: 'Gifts',
          value: { figure: 'gifts' },
          previousLabel: '2024',
          previous: { figure: 'gifts_before' },
          change: { figure: 'gifts_change' },
        },
        {
          label: 'Average gift',
          value: { figure: 'average_gift' },
          previousLabel: '2024',
          previous: { figure: 'average_before' },
          change: { figure: 'average_change' },
        },
        {
          label: 'Website visits',
          value: { figure: 'sessions' },
          compact: true,
          previousLabel: '2024',
          previous: { figure: 'sessions_before' },
          change: { figure: 'sessions_change' },
        },
      ],
    },
  ],
  [
    'bar_chart',
    {
      title: 'Online revenue each day, 15 November to 31 December 2025',
      subtitle: 'Canadian dollars. Giving Tuesday fell on 2 December.',
      series: { dataset: 'daily' },
      x: 'date',
      xKind: 'date',
      value: { column: 'revenue', label: 'Revenue' },
      more: [{ column: 'gifts', label: 'Gifts' }],
      highlights: [
        { x: '20251202', label: 'Giving Tuesday' },
        { x: '20251231', label: '31 Dec' },
      ],
    },
  ],
  [
    'line_chart',
    {
      x: 'date',
      xKind: 'date',
      lines: [
        { column: 'total', label: '2025' },
        { column: 'total_before', label: '2024' },
      ],
      panels: [
        {
          title: 'Running total of online revenue',
          subtitle: '15 November to 31 December, 2025 against 2024. Canadian dollars.',
          series: { dataset: 'daily' },
        },
      ],
    },
  ],
  [
    'prose',
    {
      paragraphs: [
        'The two years ran level until the last week of December. The gap opened between 26 and 31 December, when the largest gifts of the campaign arrived.',
        'Visits changed by {{fig:sessions_change}} over the same weeks, so the rise in revenue did not come from more people. It came from the people who gave, giving more.',
      ],
    },
  ],
  [
    'section',
    {
      heading: 'The two peak days, hour by hour',
      lede: 'Running totals through each day, in the time zone of the property.',
    },
  ],
  [
    'line_chart',
    {
      x: 'hour',
      xKind: 'hour',
      lines: YEARS,
      panels: [
        {
          title: 'Giving Tuesday',
          subtitle: '2 December 2025 against 3 December 2024. Running total, Canadian dollars.',
          series: { dataset: 'hours_tuesday' },
        },
        {
          title: '31 December',
          subtitle: '2025 against 2024. Running total, Canadian dollars.',
          series: { dataset: 'hours_last_day' },
        },
      ],
    },
  ],
  [
    'flag',
    {
      text: 'Hours are those of the property, Eastern time. A gift made late in the evening on the west coast is counted in the early hours of the next day.',
    },
  ],
  ['section', { heading: 'Where the money came from' }],
  [
    'data_table',
    {
      title: 'Revenue and gifts by channel',
      rows: { dataset: 'channels' },
      columns: [
        { column: 'channel', label: 'Channel' },
        { column: 'revenue', label: 'Revenue 2025' },
        { column: 'gifts', label: 'Gifts 2025' },
        { column: 'revenue_before', label: 'Revenue 2024' },
        { column: 'change', label: 'Change', kind: 'change' },
      ],
      caption:
        'Channels are the default channel groups of Google Analytics. "AI Assistant" did not exist as a channel in 2024.',
    },
  ],
  ['flag', { text: 'This caution was hidden by a person and must not be printed.' }, true],
  [
    'section',
    {
      heading: 'The main donation form',
      lede: 'Who views it, who starts it and who gives, on a computer and on a phone.',
    },
  ],
  [
    'funnel_steps',
    {
      title: 'Main donation form: who gets through',
      subtitle:
        'People who viewed the form, started it, and gave. 15 November to 31 December 2025.',
      steps: { dataset: 'funnel' },
      step: 'step',
      series: [
        { column: 'desktop', label: 'Desktop' },
        { column: 'mobile', label: 'Mobile' },
      ],
    },
  ],
  [
    'prose',
    {
      paragraphs: [
        'People on a phone are more likely to start the form than people on a computer, and far less likely to finish it. Of {{fig:mobile_started}} phone visitors who started, {{fig:mobile_gave}} gave.',
        'That points at something in the later steps on a phone: the payment fields, a wallet button, or a page that does not fit the screen. Google Analytics cannot say which. A test gift on a phone can.',
        'The form itself did not change during the campaign, so the difference between the two years is not explained by a new design. The mix of visitors did change: more of them arrived on a phone, from email and from social media, than a year earlier.',
        'If the form is fixed for phones before the next appeal, the gain is likely to show first in the gifts that follow an email, because that is where phone visitors come from.',
      ],
    },
  ],
  [
    'section',
    {
      heading: 'Every landing page that led to a gift',
      lede: 'The first page of each visit that ended in a gift, most visited first.',
    },
  ],
  [
    'data_table',
    {
      rows: { dataset: 'pages' },
      columns: [
        { column: 'page', label: 'Landing page' },
        { column: 'sessions', label: 'Visits' },
        { column: 'gifts', label: 'Gifts' },
        { column: 'revenue', label: 'Revenue' },
        { column: 'rate', label: 'Gave' },
      ],
      caption: 'The 60 landing pages with the most visits. Google Analytics lists more.',
    },
  ],
  ['section', { heading: 'About these figures' }],
  [
    'definition_list',
    {
      items: [
        {
          term: 'What is counted.',
          text: 'Gifts are purchase events sent from the donation thank-you pages. Google Analytics misses some gifts, for example when a visitor declines cookies or blocks trackers. Check totals against your fundraising database before sharing them.',
        },
        {
          term: 'Estimates.',
          text: 'The donation funnel was estimated from about a third of the data. Every other report here used all of it.',
        },
        {
          term: 'Cut-off lists.',
          text: 'The table of landing pages shows the 60 most visited. The pages left out account for a small share of gifts.',
        },
        {
          term: 'Personal data.',
          text: 'Crescendo removed 3 email addresses from page addresses before the analysis read them.',
        },
        {
          term: 'Checked twice.',
          text: 'Every query behind this report was run a second time when the analysis finished, and every figure matched.',
        },
        {
          term: 'Stated figures.',
          text: 'One figure, the {{fig:emails_sent}} appeal emails sent, was supplied by hand and could not be checked against Google Analytics.',
        },
      ],
    },
  ],
];

const REPORT = { dimensions: ['date'], metrics: ['totalRevenue', 'transactions', 'sessions'] };
const QUERIES: { tool: string; params: unknown; sampled?: string }[] = [
  {
    tool: 'ga4_report',
    params: { ...REPORT, dateRanges: [{ startDate: '2025-11-15', endDate: '2025-12-31' }] },
  },
  {
    tool: 'ga4_report',
    params: { ...REPORT, dateRanges: [{ startDate: '2024-11-15', endDate: '2024-12-31' }] },
  },
  {
    tool: 'ga4_report',
    params: {
      dimensions: ['hour'],
      metrics: ['totalRevenue'],
      dateRanges: [
        { startDate: '2025-12-02', endDate: '2025-12-02' },
        { startDate: '2024-12-03', endDate: '2024-12-03' },
      ],
    },
  },
  {
    tool: 'ga4_report',
    params: {
      dimensions: ['sessionDefaultChannelGroup'],
      metrics: ['totalRevenue', 'transactions'],
      dateRanges: [
        { startDate: '2025-11-15', endDate: '2025-12-31' },
        { startDate: '2024-11-15', endDate: '2024-12-31' },
      ],
    },
  },
  {
    tool: 'ga4_funnel',
    params: {
      steps: [
        {
          name: 'Viewed the form',
          eventName: 'page_view',
          params: [{ name: 'page_location', match: 'contains', value: '/donate' }],
        },
        { name: 'Started the form', eventName: 'form_start' },
        { name: 'Gave', eventName: 'purchase' },
      ],
      dateRange: { startDate: '2025-11-15', endDate: '2025-12-31' },
      breakdownDimension: 'deviceCategory',
    },
    sampled: 'Estimated from 34% of events.',
  },
  {
    tool: 'ga4_report',
    params: {
      dimensions: ['landingPage'],
      metrics: ['sessions', 'transactions', 'totalRevenue'],
      dateRanges: [{ startDate: '2025-11-15', endDate: '2025-12-31' }],
      metricFilter: { field: 'transactions', op: '>', number: 0 },
      orderBys: [{ field: 'sessions', desc: true }],
      limit: 60,
    },
  },
];

/** The fixture report in a store of its own. Block ids are b1, b2, ... in page order. */
export async function fixtureReport(): Promise<{ store: ReportStore; runId: string }> {
  const store = memoryStore();
  const run = await store.createRun({
    definitionId: null,
    definitionSnapshot: {
      key: 'year-end-giving-review',
      name: 'Year-end giving review',
      prompt: '',
      enabledTools: ['ga4_report', 'ga4_funnel'],
      maxSteps: 500,
      maxMinutes: 120,
    },
    title: 'Year-end giving review, 2025',
    preparedBy: 'Sam Rivera',
    inputs: {},
  });

  for (const query of QUERIES) {
    await store.saveQuery(run.id, {
      tool: query.tool,
      params: query.params,
      result: { headers: [], rows: [] },
      rowCount: 0,
      sampled: !!query.sampled,
      samplingNote: query.sampled ?? null,
    });
  }
  for (const [key, label, unit, value, source] of FIGURES) {
    await store.upsertFigure({
      runId: run.id,
      key,
      label,
      unit,
      value,
      text: null,
      display: formatFigure(value, unit, CURRENCY),
      source,
      queryKeys: queryKeys(key),
      recheckStatus: source.kind === 'stated' ? 'stated' : 'matched',
      previousValue: null,
    });
  }
  const datasets = [
    daily(),
    hours('hours_tuesday', 'Running total of revenue by hour, Giving Tuesday', 11, 160),
    hours('hours_last_day', 'Running total of revenue by hour, 31 December', 29, 540),
    CHANNELS,
    pages(),
    FUNNEL,
  ];
  for (const dataset of datasets) await store.upsertDataset({ ...dataset, runId: run.id });

  const blocks: BlockInstance[] = BLOCKS.map(([block, data, hidden], i) => ({
    id: `b${i + 1}`,
    block,
    version: 1,
    data,
    ...(hidden ? { hidden } : {}),
  }));
  await store.updateRun(run.id, {
    status: 'COMPLETED',
    blocks,
    timeZone: 'America/Toronto',
    currencyCode: CURRENCY,
    completedAt: new Date('2026-01-06T15:00:00Z'),
  });
  return { store, runId: run.id };
}
