import type { FigureSource, ReportFigure, ReportQuery, RowMatch } from './types';

/**
 * The ledger as a spreadsheet: every figure of a report with the query, or
 * queries, behind it. Plain functions over plain values, so the run page
 * can use them in the browser too.
 */

const condition = (match: RowMatch) =>
  `${match.column} ${match.op} ${Array.isArray(match.value) ? match.value.join(', ') : match.value}`;

/** Where a figure comes from, in a line. */
export function describeSource(source: FigureSource): string {
  switch (source.kind) {
    case 'cell':
      return `${source.column} in ${source.query}, where ${source.where.map(condition).join(' and ')}`;
    case 'aggregate':
      return `${source.agg} of ${source.column} in ${source.query}${
        source.where?.length ? `, where ${source.where.map(condition).join(' and ')}` : ''
      }`;
    case 'formula':
      return `${source.expr}, with ${Object.entries(source.refs)
        .map(([name, key]) => `${name} = ${key}`)
        .join(', ')}`;
    default:
      return `Stated: ${source.reason}`;
  }
}

type Params = Record<string, unknown>;
const record = (value: unknown): Params =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Params) : {};
const names = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join('; ') : typeof value === 'string' ? value : '';

/** A GA4 filter as a person would say it: pagePath contains "/donate" and country = "Canada". */
function describeFilter(value: unknown): string {
  const filter = record(value);
  const group = (items: unknown, word: string) => {
    const parts = (Array.isArray(items) ? items : []).map(describeFilter).filter(Boolean);
    return parts.length > 1 ? `(${parts.join(` ${word} `)})` : (parts[0] ?? '');
  };
  if (filter.and) return group(filter.and, 'and');
  if (filter.or) return group(filter.or, 'or');
  if (filter.not) return `not ${describeFilter(filter.not)}`;
  if (typeof filter.field !== 'string') return '';
  if (filter.op) return `${filter.field} ${String(filter.op)} ${String(filter.number)}`;
  const operand = Array.isArray(filter.values)
    ? filter.values.map((item) => JSON.stringify(item)).join(', ')
    : JSON.stringify(filter.value ?? '');
  return `${filter.field} ${String(filter.match ?? 'exact')} ${operand}`;
}

/** The steps of a funnel: Saw the form (page_view, page_location contains "/donate") > Gave (purchase). */
function describeSteps(value: unknown): string {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .map((step) => {
      const params = (Array.isArray(step.params) ? step.params : [])
        .map(record)
        .map(
          (param) =>
            `${String(param.name)} ${String(param.match ?? 'exact')} ${JSON.stringify(param.value ?? '')}`
        );
      return `${String(step.name ?? '')} (${[String(step.eventName ?? ''), ...params].join(', ')})`;
    })
    .join(' > ');
}

/** What a saved query asked for, as the cells that describe it. */
function describeQuery(query: ReportQuery) {
  const params = record(query.params);
  const ranges = Array.isArray(params.dateRanges)
    ? params.dateRanges
    : params.dateRange
      ? [params.dateRange]
      : [];
  return {
    tool: query.tool,
    dimensions: names(params.dimensions ?? params.breakdownDimension),
    metrics: names(params.metrics),
    dates: ranges
      .map(record)
      .map((range) => `${String(range.startDate)} to ${String(range.endDate)}`)
      .join('; '),
    filters: [
      describeFilter(params.dimensionFilter),
      describeFilter(params.metricFilter),
      describeSteps(params.steps),
    ]
      .filter(Boolean)
      .join('; '),
    sampled: query.sampled ? (query.samplingNote ? `yes: ${query.samplingNote}` : 'yes') : 'no',
  };
}

/**
 * Text that came from outside (a label, a page address, a campaign name) is
 * never allowed to start a cell as a formula: a spreadsheet would run it.
 */
const text = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const cell = (value: string | number | null) => {
  const out = value === null ? '' : String(value);
  return /[",\r\n]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
};

export const LEDGER_CSV_COLUMNS = [
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
];

/**
 * The ledger as CSV. A figure built from two queries gets one row per
 * query, so every number can be traced to each report behind it; a stated
 * figure, which has no query, gets one row with the query columns empty.
 */
export function ledgerToCsv(figures: ReportFigure[], queries: ReportQuery[]): string {
  const byKey = new Map(queries.map((query) => [query.key, query]));
  const lines = [LEDGER_CSV_COLUMNS];

  for (const figure of figures) {
    const worded = figure.unit === 'text';
    const before = [
      text(figure.key),
      text(figure.label),
      worded ? text(figure.display) : figure.display,
      figure.value ?? (figure.text === null ? null : text(figure.text)),
      figure.unit,
      text(describeSource(figure.source)),
    ];
    const after = [figure.recheckStatus, figure.previousValue];

    for (const key of figure.queryKeys.length ? figure.queryKeys : [null]) {
      const query = key === null ? undefined : byKey.get(key);
      const asked = query ? describeQuery(query) : null;
      lines.push(
        [
          ...before,
          key,
          asked?.tool ?? null,
          asked && text(asked.dimensions),
          asked && text(asked.metrics),
          asked?.dates ?? null,
          asked && text(asked.filters),
          asked?.sampled ?? null,
          ...after,
        ].map(cell)
      );
    }
  }
  // CRLF between records, as spreadsheets expect.
  return lines.map((line) => line.join(',')).join('\r\n') + '\r\n';
}
