import { Liquid, type Context, type Template } from 'liquidjs';
import { formatFigure } from '../ledger';
import { UNITS, type Cell, type Unit } from '../types';
import type { RenderMode } from '../design/shell';
import {
  axisLabel,
  chartBars,
  chartLine,
  chartRows,
  compactNumber,
  tableView,
  formatChange,
  type AxisKind,
} from './charts';
import { sanitizeBlockHtml } from './sanitize';
import type { BlockSeed } from './types';

/** A block key: it becomes a class name, blk-<key>. */
export const BLOCK_KEY = /^[a-z][a-z0-9_]*$/;

/**
 * One Liquid engine for every block. Output is escaped, nothing is read from
 * disk, and parsing, rendering and memory are capped, so a template cannot
 * loop for ever or pull in a file.
 */
const engine = new Liquid({
  strictVariables: false,
  strictFilters: true,
  outputEscape: 'escape',
  ownPropertyOnly: true,
  // An empty in-memory set of templates: include and render find nothing.
  templates: {},
  parseLimit: 200_000,
  renderLimit: 2_000,
  memoryLimit: 20_000_000,
});
// `raw` would switch escaping off for one output.
engine.unregisterFilter('raw');
for (const tag of ['include', 'render', 'layout', 'block']) delete engine.tags[tag];

/** What a filter is called on. */
type FilterImpl = { context: Context };

const currencyOf = (filter: FilterImpl): string | null => {
  const globals = filter.context.globals as { currencyCode?: string | null };
  return globals.currencyCode ?? null;
};

const size = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 120 && n <= 2000 ? n : fallback;
};

// {% assign c = data.series | chart_line: 860, 300, data.x, data.lines, data.xKind %}
engine.registerFilter(
  'chart_line',
  function (this: FilterImpl, dataset, width, height, x, lines, kind) {
    return chartLine(dataset, {
      width: size(width, 860),
      height: size(height, 300),
      x: String(x ?? ''),
      lines,
      kind,
      currencyCode: currencyOf(this),
    });
  }
);

// {% assign c = data.series | chart_bars: 860, 300, data.x, data.value, data.xKind, data.highlights, data.more %}
engine.registerFilter(
  'chart_bars',
  function (this: FilterImpl, dataset, width, height, x, value, kind, highlights, extra) {
    return chartBars(dataset, {
      width: size(width, 860),
      height: size(height, 300),
      x: String(x ?? ''),
      value,
      kind,
      highlights,
      extra,
      currencyCode: currencyOf(this),
    });
  }
);

// {% assign c = data.steps | chart_rows: data.step, data.series, 'previous' %}
engine.registerFilter('chart_rows', function (this: FilterImpl, dataset, label, series, share) {
  return chartRows(dataset, {
    label: String(label ?? ''),
    series,
    share,
    currencyCode: currencyOf(this),
  });
});

// {% assign t = data.rows | table: data.columns %}, or for the table behind a
// chart: {% assign t = data.series | table: data.lines, data.x, data.xKind, data.xLabel %}
engine.registerFilter('table', function (this: FilterImpl, dataset, columns, x, xKind, xLabel) {
  return tableView(dataset, { columns, x, xKind, xLabel, currencyCode: currencyOf(this) });
});

/**
 * {{ cell | fmt: 'currency' }}: write a ledger value. The formats are the
 * ledger's units (currency, count, percent, ratio, text) and: `change`, a
 * signed percent from a fraction; `compact`, a short form, with the unit as
 * a second argument; `date`, `hour` and `category`, for the x column of a
 * chart's table. An empty value is a dash.
 */
engine.registerFilter('fmt', function (this: FilterImpl, value, format, unit) {
  if (value === null || value === undefined || value === '') return '—';
  const kind = String(format ?? 'text');
  if (kind === 'date' || kind === 'hour' || kind === 'category') {
    return axisLabel(value as Cell, kind as AxisKind, true);
  }
  if (typeof value !== 'number') return String(value);
  if (kind === 'change') return formatChange(value);
  if (kind === 'compact') {
    const of = (UNITS as readonly string[]).includes(String(unit)) ? (unit as Unit) : 'count';
    return compactNumber(value, of, currencyOf(this));
  }
  const of = (UNITS as readonly string[]).includes(kind) ? (kind as Unit) : 'count';
  return formatFigure(value, of, currencyOf(this));
});

// {{ cell | tone }}: "up" for a rise, "down" for a fall, nothing otherwise.
engine.registerFilter('tone', (value) =>
  typeof value !== 'number' || value === 0 ? '' : value > 0 ? 'up' : 'down'
);

const parsed = new Map<string, Template[]>();

/** Parse a template, or throw with Liquid's message. */
export function parseTemplate(template: string): Template[] {
  let found = parsed.get(template);
  if (!found) {
    found = engine.parse(template);
    parsed.set(template, found);
  }
  return found;
}

export interface RenderOptions {
  mode: RenderMode;
  /** The id of the block in its report. */
  blockId?: string;
  currencyCode?: string | null;
}

/** The template's own output, before the sanitiser: for validation only. */
export function renderRaw(
  def: Pick<BlockSeed, 'key' | 'template'>,
  resolvedData: unknown,
  opts: RenderOptions
): string {
  return engine.renderSync(
    parseTemplate(def.template),
    { data: resolvedData, mode: opts.mode, block: { id: opts.blockId ?? def.key, key: def.key } },
    { globals: { currencyCode: opts.currencyCode ?? null } }
  ) as string;
}

const escapeAttribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Draw one block from data whose references are already resolved. The
 * result is sanitised and wrapped in the block's section.
 */
export function renderBlock(
  def: Pick<BlockSeed, 'key' | 'template'>,
  resolvedData: unknown,
  opts: RenderOptions
): string {
  if (!BLOCK_KEY.test(def.key)) throw new Error(`"${def.key}" is not a block key.`);
  const { html } = sanitizeBlockHtml(renderRaw(def, resolvedData, opts));
  return `<section class="blk blk-${def.key}" data-block-id="${escapeAttribute(opts.blockId ?? def.key)}">${html}</section>`;
}
