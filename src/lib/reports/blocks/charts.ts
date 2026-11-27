import { formatFigure } from '../ledger';
import type { Cell, Unit } from '../types';
import type { ResolvedDataset } from './types';

/**
 * The chart helpers. A template hands one a table and a size and gets back
 * everything it needs to draw: tidy axis ticks, scaled points, path data,
 * and labels placed so they do not collide. Templates draw; they never
 * compute a scale. Every chart block, built-in or built later, goes through
 * these, which is what keeps their quality the same.
 */

export type AxisKind = 'date' | 'hour' | 'category';

export class ChartError extends Error {}

const LOCALE = 'en-CA';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The least room between two labels under an axis: about the width of a letter and a space.
const LABEL_GAP = 10;
// The longest bar of a row chart, as a percent of its row: the label after it always has room.
const LONGEST_ROW_BAR = 55;

const round = (value: number, places = 1) => Number(value.toFixed(places));

/**
 * About how wide a piece of chart text is, in the chart's units. Chart text
 * is 11px Inter with tabular figures; nothing here can measure it, so this
 * adds up typical widths and errs on the wide side.
 */
function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (/[0-9$€£]/.test(char)) width += 7;
    else if (/[A-Z%]/.test(char)) width += 7.8;
    else if (/[mw]/.test(char)) width += 9.2;
    else if (/[ijlt.,:;'’ ]/.test(char)) width += 3.6;
    else width += 6.3;
  }
  return width;
}

// ── Numbers ────────────────────────────────────────────────────────────────

/** Fix what binary arithmetic does to a sum of steps: 0.30000000000000004 → 0.3. */
const clean = (value: number) => Number(value.toPrecision(12));

/**
 * Tick values for an axis from `min` to `max`: steps of 1, 2, 2.5 or 5 times
 * a power of ten, about `target` of them, starting and ending on a tick.
 * With `whole`, a step is never a fraction (a count has no half).
 */
export function tidyTicks(
  min: number,
  max: number,
  target = 5,
  whole = false
): { ticks: number[]; step: number; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new ChartError('No numbers to scale.');
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    // A flat series still needs an axis: open it up around the value.
    if (max === 0) max = 1;
    else if (max > 0) min = 0;
    else max = 0;
  }

  const raw = (max - min) / Math.max(1, target);
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = power * 10;
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const candidate = clean(factor * power);
    if (whole && !Number.isInteger(candidate)) continue;
    if (candidate >= raw * (1 - 1e-9)) {
      step = candidate;
      break;
    }
  }
  if (whole && step < 1) step = 1;

  const low = clean(Math.floor(min / step + 1e-9) * step);
  const high = clean(Math.ceil(max / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let i = 0; clean(low + i * step) <= high; i++) ticks.push(clean(low + i * step));
  return { ticks, step, min: low, max: high };
}

function currencySymbol(currencyCode: string | null): string {
  try {
    const parts = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: currencyCode || 'USD',
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? '$';
  } catch {
    return '';
  }
}

const trimZeros = (text: string) => (text.includes('.') ? text.replace(/\.?0+$/, '') : text);

/** A short form for a label on a chart: $44.4k, 1.8M, 37.2%. */
export function compactNumber(value: number, unit: Unit, currencyCode: string | null): string {
  if (unit === 'percent' || unit === 'ratio' || unit === 'text') {
    return formatFigure(value, unit, currencyCode);
  }
  const abs = Math.abs(value);
  let body: string;
  if (abs >= 1e6) body = `${trimZeros((abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1))}M`;
  else if (abs >= 1e3) body = `${trimZeros((abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1))}k`;
  else body = trimZeros(abs.toFixed(Number.isInteger(abs) ? 0 : 1));
  const symbol = unit === 'currency' ? currencySymbol(currencyCode) : '';
  return `${value < 0 ? '−' : ''}${symbol}${body}`;
}

/**
 * The short form for a headline tile: three figures whatever the size, so
 * tiles side by side are equally exact ($413k beside 1.28M, never 1.3M).
 * A number under 10,000 is short already and is written in full.
 */
export function shortNumber(value: number, unit: Unit, currencyCode: string | null): string {
  const figures = Number(Math.abs(value).toPrecision(3));
  if (unit === 'percent' || unit === 'ratio' || unit === 'text' || figures < 1e4) {
    return formatFigure(value, unit, currencyCode);
  }
  const body =
    figures >= 1e9
      ? `${Math.round(figures / 1e6).toLocaleString(LOCALE)}M`
      : figures >= 1e6
        ? `${(figures / 1e6).toPrecision(3)}M`
        : `${(figures / 1e3).toPrecision(3)}k`;
  const symbol = unit === 'currency' ? currencySymbol(currencyCode) : '';
  return `${value < 0 ? '−' : ''}${symbol}${body}`;
}

/** Labels for a set of ticks, all in the same unit of thousands or millions. */
function tickLabels(
  ticks: number[],
  step: number,
  unit: Unit,
  currencyCode: string | null
): string[] {
  const top = Math.max(...ticks.map(Math.abs));
  const symbol = unit === 'currency' ? currencySymbol(currencyCode) : '';
  const [divisor, suffix] =
    unit === 'percent' ? [0.01, '%'] : top >= 1e6 ? [1e6, 'M'] : top >= 1e4 ? [1e3, 'k'] : [1, ''];
  // As many decimals as the step needs, so 2.5k is not shown as 3k.
  const scaledStep = clean(step / divisor);
  const places = Math.min(2, (String(scaledStep).split('.')[1] ?? '').length);
  return ticks.map((tick) => {
    const scaled = clean(Math.abs(tick) / divisor);
    const body =
      divisor === 1 && unit !== 'percent'
        ? new Intl.NumberFormat(LOCALE, {
            minimumFractionDigits: places,
            maximumFractionDigits: places,
          }).format(scaled)
        : scaled.toFixed(places);
    return `${tick < 0 ? '−' : ''}${symbol}${tick === 0 ? '0' : body}${tick === 0 && unit !== 'percent' ? '' : suffix}`;
  });
}

/** +17%, −4.6%, 0%: a change, from a fraction. One decimal under ten percent. */
export function formatChange(value: number): string {
  const percent = Math.abs(value) * 100;
  if (percent < 0.05) return '0%';
  const body = percent < 9.95 ? percent.toFixed(1) : Math.round(percent).toLocaleString(LOCALE);
  return `${value < 0 ? '−' : '+'}${body}%`;
}

// ── Dates and hours ────────────────────────────────────────────────────────

/** Read 20261115 or 2026-11-15. Null for anything else. */
export function parseDay(raw: Cell): Date | null {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(String(raw ?? '').trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCDate() === Number(match[3]) ? date : null;
}

/**
 * An hour of the day. Under an axis every label has the same short form
 * (12am, 6am, 12pm), so none crowds its neighbour; in a table or a hover
 * label, where there is room, the two ends of the clock are words.
 */
export function hourLabel(raw: Cell, long = true): string {
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return String(raw ?? '');
  if (long && hour === 0) return 'midnight';
  if (long && hour === 12) return 'noon';
  return `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`;
}

/** The short label under an axis, and the long one in a hover label or a table. */
export function axisLabel(raw: Cell, kind: AxisKind, long = false): string {
  if (kind === 'hour') return hourLabel(raw, long);
  if (kind === 'date') {
    const date = parseDay(raw);
    if (!date) return String(raw ?? '');
    const short = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
    return long ? `${DAYS[date.getUTCDay()]} ${short} ${date.getUTCFullYear()}` : short;
  }
  return String(raw ?? '');
}

/**
 * Which positions along the x axis get a label. Dates step by whole weeks
 * when they can; hours fall on the quarters of the day (12am, 6am, 12pm,
 * 6pm); names are thinned evenly. The last position is labelled when there
 * is room for it.
 */
function xTickIndexes(
  labels: string[],
  kind: AxisKind,
  at: (index: number) => number,
  anchorOf: (index: number) => Tick['anchor']
): number[] {
  const n = labels.length;
  if (n === 0) return [];

  // Where a label would sit, given its anchor.
  const box = (i: number) => {
    const w = textWidth(labels[i]);
    const anchor = anchorOf(i);
    const from = anchor === 'start' ? at(i) : anchor === 'end' ? at(i) - w : at(i) - w / 2;
    return { from, to: from + w };
  };
  const clear = (indexes: number[]) =>
    indexes.every((index, k) => k === 0 || box(index).from - box(indexes[k - 1]).to >= LABEL_GAP);

  const pick = (step: number) => {
    const indexes: number[] = [];
    for (let i = 0; i < n; i += step) indexes.push(i);
    return indexes;
  };
  // Hours keep to quarters of the day however wide the chart is: 12am, 6am,
  // 12pm, 6pm reads at a glance, and every second hour does not.
  const steps =
    kind === 'date' ? [1, 2, 7, 14, 28, 56] : kind === 'hour' ? [6, 12] : [1, 2, 3, 4, 5];
  let indexes = steps.map(pick).find(clear);
  for (let step = steps[steps.length - 1] + 1; !indexes && step <= n; step++) {
    if (clear(pick(step))) indexes = pick(step);
  }
  indexes ??= [0];

  const last = indexes[indexes.length - 1];
  if (last !== n - 1) {
    if (clear([...indexes, n - 1])) indexes.push(n - 1);
    // Too close to the one before. For names, the end of the range matters
    // more than a regular step. Dates and hours keep their step: 6pm with
    // nothing after it reads better than 12pm, a gap, then 11pm.
    else if (kind === 'category' && indexes.length > 1) {
      const swapped = [...indexes.slice(0, -1), n - 1];
      if (clear(swapped)) indexes = swapped;
    }
  }
  return indexes;
}

// ── Reading a table ────────────────────────────────────────────────────────

function columnIndex(dataset: ResolvedDataset, column: string, filter: string): number {
  const index = dataset.columns.findIndex((c) => c.key === column);
  if (index === -1) {
    throw new ChartError(
      `${filter}: the table has no column "${column}". Its columns are: ${dataset.columns.map((c) => c.key).join(', ')}.`
    );
  }
  return index;
}

function requireDataset(value: unknown, filter: string): ResolvedDataset {
  const dataset = value as ResolvedDataset | null;
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    throw new ChartError(`${filter}: this needs a table from the ledger.`);
  }
  return dataset;
}

/** The rows a chart draws: every row but the total. */
const bodyRows = (dataset: ResolvedDataset) =>
  dataset.totalRow ? dataset.rows.slice(0, -1) : dataset.rows;

const numberAt = (row: Cell[], index: number): number | null => {
  const cell = row[index];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
};

const valueUnit = (dataset: ResolvedDataset, index: number): Unit => {
  const unit = dataset.columns[index].format;
  return unit === 'text' ? 'count' : unit;
};

export interface SeriesRef {
  column: string;
  label: string;
}

interface Tick {
  /** Position along the axis, in the chart's own units. */
  at: number;
  label: string;
  anchor: 'start' | 'middle' | 'end';
}

/** The plot area and its axes. Templates read positions; they add nothing up. */
interface Frame {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** A y tick's label sits at x = yLabelX, y = tick.textY. */
  yTicks: (Tick & { textY: number })[];
  yLabelX: number;
  /** An x tick's label sits at x = tick.at, y = xLabelY. */
  xTicks: Tick[];
  xLabelY: number;
}

function seriesList(value: unknown, filter: string): SeriesRef[] {
  const list = (Array.isArray(value) ? value : value ? [value] : []).filter(
    (item): item is SeriesRef => !!item && typeof (item as SeriesRef).column === 'string'
  );
  if (list.length === 0) throw new ChartError(`${filter}: name at least one column to draw.`);
  return list.map((item) => ({ column: item.column, label: String(item.label ?? item.column) }));
}

const axisKind = (value: unknown): AxisKind =>
  value === 'date' || value === 'hour' ? value : 'category';

// ── Line chart ─────────────────────────────────────────────────────────────

export interface LineChart extends Frame {
  series: {
    cls: string;
    label: string;
    path: string;
    /** The value at the end of the line, set to the right of it. */
    end: { x: number; y: number; text: string } | null;
  }[];
  hits: { x: number; width: number; tx: number; ty: number; dots: string; tip: string }[];
  /** One sentence for the chart's description. */
  summary: string;
}

export function chartLine(
  input: unknown,
  opts: {
    width: number;
    height: number;
    x: string;
    lines: unknown;
    kind?: unknown;
    currencyCode: string | null;
  }
): LineChart {
  const dataset = requireDataset(input, 'chart_line');
  const kind = axisKind(opts.kind);
  const lines = seriesList(opts.lines, 'chart_line').slice(0, 2);
  const xIndex = columnIndex(dataset, opts.x, 'chart_line');
  const indexes = lines.map((line) => columnIndex(dataset, line.column, 'chart_line'));
  const rows = bodyRows(dataset);
  if (rows.length === 0) throw new ChartError('chart_line: the table has no rows.');

  const unit = valueUnit(dataset, indexes[0]);
  const values = rows.flatMap((row) => indexes.map((i) => numberAt(row, i)));
  const numbers = values.filter((v): v is number => v !== null);
  if (numbers.length === 0) throw new ChartError('chart_line: the columns hold no numbers.');

  const { width, height } = opts;
  const wide = width >= 600;
  const scale = tidyTicks(
    Math.min(0, ...numbers),
    Math.max(...numbers),
    height >= 280 ? 5 : 4,
    unit === 'count'
  );
  const yLabels = tickLabels(scale.ticks, scale.step, unit, opts.currencyCode);

  // The end of each line carries its value; on a wide chart, its name too.
  const ends = lines.map((line, s) => {
    for (let r = rows.length - 1; r >= 0; r--) {
      const value = numberAt(rows[r], indexes[s]);
      if (value !== null) {
        const short = compactNumber(value, unit, opts.currencyCode);
        return { row: r, value, text: wide && lines.length > 1 ? `${line.label} ${short}` : short };
      }
    }
    return null;
  });

  // The margins have a floor, so two charts side by side usually get the
  // same plot, and with it the same ticks.
  const left = Math.ceil(Math.max(36, ...yLabels.map(textWidth)) + 10);
  const right = Math.ceil(Math.max(40, ...ends.map((end) => (end ? textWidth(end.text) : 0))) + 12);
  const top = 12;
  const bottom = 26;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const n = rows.length;
  const x = (i: number) => round(left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW));
  const y = (v: number) => round(top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH);

  const xLabels = rows.map((row) => axisLabel(row[xIndex], kind));
  // The first label starts at the axis and the last ends at it, so neither hangs outside.
  const xAnchor = (i: number): Tick['anchor'] =>
    n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
  const xTicks = xTickIndexes(xLabels, kind, x, xAnchor).map((i) => ({
    at: x(i),
    label: xLabels[i],
    anchor: xAnchor(i),
  }));

  const series = lines.map((line, s) => {
    let path = '';
    let pen = false;
    rows.forEach((row, i) => {
      const value = numberAt(row, indexes[s]);
      if (value === null) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(i)},${y(value)} `;
      pen = true;
    });
    const end = ends[s];
    return {
      cls: `s${s + 1}`,
      label: line.label,
      path: path.trim(),
      end: end ? { x: x(end.row) + 6, y: y(end.value) + 4, text: end.text } : null,
    };
  });

  // Two values that end close together are moved apart, the higher one up.
  const placed = series.map((s) => s.end).filter((end): end is NonNullable<typeof end> => !!end);
  if (placed.length === 2 && Math.abs(placed[0].y - placed[1].y) < 13) {
    const [upper, lower] = placed[0].y <= placed[1].y ? placed : [placed[1], placed[0]];
    const middle = (upper.y + lower.y) / 2;
    upper.y = round(Math.max(top + 9, middle - 6.5));
    lower.y = round(upper.y + 13);
  }

  const hits = rows.map((row, i) => {
    const before = i === 0 ? left : (x(i - 1) + x(i)) / 2;
    const after = i === n - 1 ? left + plotW : (x(i) + x(i + 1)) / 2;
    const points = indexes.map((index) => numberAt(row, index));
    const heights = points.map((v) => (v === null ? null : y(v)));
    const shown = heights.filter((h): h is number => h !== null);
    return {
      x: round(before),
      width: round(Math.max(1, after - before)),
      tx: x(i),
      ty: shown.length ? Math.min(...shown) : top,
      dots: heights.map((h) => (h === null ? '' : String(h))).join(','),
      tip: [
        axisLabel(row[xIndex], kind, true),
        ...lines.map(
          (line, s) =>
            `${line.label}: ${formatFigure(points[s], valueUnit(dataset, indexes[s]), opts.currencyCode)}`
        ),
      ].join('\n'),
    };
  });

  const summary =
    lines
      .map((line, s) => {
        const end = ends[s];
        if (!end) return `${line.label} has no values`;
        return `${line.label} ends at ${formatFigure(end.value, unit, opts.currencyCode)}`;
      })
      .join('; ') +
    `, from ${axisLabel(rows[0][xIndex], kind, true)} to ${axisLabel(rows[n - 1][xIndex], kind, true)}.`;

  return {
    width,
    height,
    left,
    right: left + plotW,
    top,
    bottom: top + plotH,
    yTicks: scale.ticks.map((tick, i) => ({
      at: y(tick),
      textY: round(y(tick) + 4),
      label: yLabels[i],
      anchor: 'end',
    })),
    yLabelX: left - 8,
    xTicks,
    xLabelY: top + plotH + 17,
    series,
    hits,
    summary,
  };
}

// ── Bar chart ──────────────────────────────────────────────────────────────

export interface BarChart extends Frame {
  bars: { path: string }[];
  hits: { x: number; width: number; tx: number; ty: number; tip: string }[];
  /** Values written above chosen bars, with a short line down to a bar the label had to clear. */
  labels: {
    x: number;
    y: number;
    text: string;
    anchor: 'start' | 'middle' | 'end';
    leader: { x: number; y1: number; y2: number } | null;
  }[];
  /** The value column and any extra ones, for the table behind the chart. */
  columns: SeriesRef[];
  summary: string;
}

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}
const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

export function chartBars(
  input: unknown,
  opts: {
    width: number;
    height: number;
    x: string;
    /** The column to draw: { column, label }. */
    value: unknown;
    kind?: unknown;
    /** Bars to name: { x: the bar's value on the x axis, label }. With none, the tallest is labelled. */
    highlights?: unknown;
    /** More columns to show in the hover label: [{ column, label }]. */
    extra?: unknown;
    currencyCode: string | null;
  }
): BarChart {
  const dataset = requireDataset(input, 'chart_bars');
  const kind = axisKind(opts.kind);
  const xIndex = columnIndex(dataset, opts.x, 'chart_bars');
  const [valueColumn] = seriesList(opts.value, 'chart_bars');
  const vIndex = columnIndex(dataset, valueColumn.column, 'chart_bars');
  const rows = bodyRows(dataset);
  if (rows.length === 0) throw new ChartError('chart_bars: the table has no rows.');
  const unit = valueUnit(dataset, vIndex);
  const values = rows.map((row) => numberAt(row, vIndex) ?? 0);
  if (values.some((v) => v < 0)) throw new ChartError('chart_bars: bars cannot go below zero.');
  const more =
    Array.isArray(opts.extra) && opts.extra.length ? seriesList(opts.extra, 'chart_bars') : [];
  const extra = more.map((item) => ({
    label: item.label,
    index: columnIndex(dataset, item.column, 'chart_bars'),
  }));
  const columns = [valueColumn, ...more];

  const { width, height } = opts;
  const scale = tidyTicks(0, Math.max(...values), height >= 280 ? 5 : 4, unit === 'count');
  const yLabels = tickLabels(scale.ticks, scale.step, unit, opts.currencyCode);

  const left = Math.ceil(Math.max(...yLabels.map(textWidth)) + 10);
  const top = 28;
  const bottom = 26;
  const plotW = width - left - 8;
  const plotH = height - top - bottom;
  const n = rows.length;
  const band = plotW / n;
  const gap = band >= 12 ? 2 : band >= 5 ? 1 : 0;
  const base = top + plotH;
  const y = (v: number) => round(base - (v / scale.max) * plotH);
  const centre = (i: number) => round(left + i * band + band / 2);

  const bars = values.map((value, i) => {
    const x0 = round(left + i * band + gap / 2);
    const x1 = round(left + (i + 1) * band - gap / 2);
    const h = value > 0 ? Math.max(1, base - y(value)) : 0;
    const r = round(Math.min(4, (x1 - x0) / 2, h));
    const yt = round(base - h);
    return {
      path:
        h === 0
          ? ''
          : `M${x0},${base} V${round(yt + r)} Q${x0},${yt} ${round(x0 + r)},${yt} H${round(x1 - r)} Q${x1},${yt} ${x1},${round(yt + r)} V${base} Z`,
    };
  });

  const xLabels = rows.map((row) => axisLabel(row[xIndex], kind));
  const xTicks = xTickIndexes(xLabels, kind, centre, () => 'middle').map((i) => ({
    at: centre(i),
    label: xLabels[i],
    anchor: 'middle' as const,
  }));

  const valueLabel = valueColumn.label;
  const hits = rows.map((row, i) => ({
    x: round(left + i * band),
    width: round(band),
    tx: centre(i),
    ty: y(values[i]),
    tip: [
      axisLabel(row[xIndex], kind, true),
      `${valueLabel}: ${formatFigure(numberAt(row, vIndex), unit, opts.currencyCode)}`,
      ...extra.map(
        (item) =>
          `${item.label}: ${formatFigure(numberAt(row, item.index), valueUnit(dataset, item.index), opts.currencyCode)}`
      ),
    ].join('\n'),
  }));

  // Which bars to name
  const tallest = values.indexOf(Math.max(...values));
  const wanted: { index: number; text: string }[] = [];
  const asked = Array.isArray(opts.highlights) ? opts.highlights : [];
  for (const item of asked as { x?: unknown; label?: unknown }[]) {
    const day = parseDay(item?.x as Cell);
    const index = rows.findIndex((row) => {
      if (String(row[xIndex]) === String(item?.x)) return true;
      const other = day && parseDay(row[xIndex]);
      return !!other && other.getTime() === day!.getTime();
    });
    if (index === -1) continue;
    const short = compactNumber(values[index], unit, opts.currencyCode);
    wanted.push({ index, text: item?.label ? `${String(item.label)} ${short}` : short });
  }
  if (wanted.length === 0) {
    wanted.push({ index: tallest, text: compactNumber(values[tallest], unit, opts.currencyCode) });
  }

  // Place each label above its bar, clear of every bar under it and of the
  // labels already placed. The tallest bars are placed first; a label with
  // no room is left out.
  const labels: BarChart['labels'] = [];
  const boxes: Box[] = [];
  for (const item of [...wanted].sort((a, b) => values[b.index] - values[a.index])) {
    // Bar labels are set in a heavier weight.
    const w = textWidth(item.text) * 1.06;
    const cx = centre(item.index);
    const anchor = cx + w / 2 > width - 2 ? 'end' : cx - w / 2 < left ? 'start' : 'middle';
    const x1 =
      anchor === 'end' ? cx + band / 2 - w : anchor === 'start' ? cx - band / 2 : cx - w / 2;
    const x2 = x1 + w;
    const under = values
      .map((value, i) => ({ value, from: left + i * band, to: left + (i + 1) * band }))
      .filter((bar) => bar.from < x2 && bar.to > x1);
    const own = y(values[item.index]);
    let baseline = Math.min(own, ...under.map((bar) => y(bar.value))) - 7;
    let box: Box = { x1: x1 - 3, x2: x2 + 3, y1: baseline - 10, y2: baseline + 3 };
    let tries = 0;
    while (boxes.some((other) => overlaps(box, other)) && tries < 3) {
      baseline -= 14;
      box = { ...box, y1: baseline - 10, y2: baseline + 3 };
      tries++;
    }
    if (boxes.some((other) => overlaps(box, other)) || baseline - 9 < 0) continue;
    boxes.push(box);
    labels.push({
      x: round(anchor === 'end' ? x2 : anchor === 'start' ? x1 : cx),
      y: round(baseline),
      text: item.text,
      anchor,
      leader: own - baseline > 16 ? { x: cx, y1: round(baseline + 4), y2: round(own - 3) } : null,
    });
  }

  const summary = `${n} bars from ${axisLabel(rows[0][xIndex], kind, true)} to ${axisLabel(rows[n - 1][xIndex], kind, true)}. The highest is ${axisLabel(rows[tallest][xIndex], kind, true)} at ${formatFigure(values[tallest], unit, opts.currencyCode)}.`;

  return {
    width,
    height,
    left,
    right: left + plotW,
    top,
    bottom: base,
    yTicks: scale.ticks.map((tick, i) => ({
      at: y(tick),
      textY: round(y(tick) + 4),
      label: yLabels[i],
      anchor: 'end',
    })),
    yLabelX: left - 8,
    xTicks,
    xLabelY: base + 17,
    bars,
    hits,
    labels,
    columns,
    summary,
  };
}

// ── Bars as rows ───────────────────────────────────────────────────────────

export interface RowChart {
  rows: {
    name: string;
    bars: {
      cls: string;
      /** The bar's length as a whole percent of its row, for the class w-<width>. The longest is 55. */
      width: number;
      text: string;
    }[];
  }[];
  summary: string;
}

/**
 * Horizontal bars, one row per line of the table: steps of a funnel, or
 * named things to compare. With `share: 'previous'`, each bar after the
 * first row says what share of the row above it reached this one.
 */
export function chartRows(
  input: unknown,
  opts: { label: string; series: unknown; share?: unknown; currencyCode: string | null }
): RowChart {
  const dataset = requireDataset(input, 'chart_rows');
  const series = seriesList(opts.series, 'chart_rows').slice(0, 2);
  const labelIndex = columnIndex(dataset, opts.label, 'chart_rows');
  const indexes = series.map((item) => columnIndex(dataset, item.column, 'chart_rows'));
  const rows = bodyRows(dataset);
  if (rows.length === 0) throw new ChartError('chart_rows: the table has no rows.');

  const longest = Math.max(
    0,
    ...rows.flatMap((row) => indexes.map((index) => numberAt(row, index) ?? 0))
  );
  const named = series.length > 1;

  const out = rows.map((row, r) => ({
    name: String(row[labelIndex] ?? ''),
    bars: series.map((item, s) => {
      const value = numberAt(row, indexes[s]);
      const unit = valueUnit(dataset, indexes[s]);
      let text = formatFigure(value, unit, opts.currencyCode);
      if (named) text += ` ${item.label.toLowerCase()}`;
      if (opts.share === 'previous' && r > 0 && value !== null) {
        const before = numberAt(rows[r - 1], indexes[s]);
        if (before) {
          const share = (value / before) * 100;
          text += ` (${share < 9.95 ? share.toFixed(1) : Math.round(share)}%)`;
        }
      }
      return {
        cls: `s${s + 1}`,
        width:
          longest > 0 && value ? Math.max(1, Math.round((value / longest) * LONGEST_ROW_BAR)) : 0,
        text,
      };
    }),
  }));

  const summary = out
    .map((row) => `${row.name}: ${row.bars.map((bar) => bar.text).join(', ')}`)
    .join('. ');
  return { rows: out, summary: `${summary}.` };
}

// ── Tables ─────────────────────────────────────────────────────────────────

export interface TableView {
  head: { label: string; cls: string }[];
  rows: { total: boolean; cells: { text: string; cls: string }[] }[];
}

/**
 * A table ready to write out: the chosen columns in order, every cell
 * formatted by its column, a change coloured by its sign, and the total row
 * marked. `columns` is a list of { column, label, kind? }, where kind
 * "change" writes a fraction as a signed percent. With `x`, that column is
 * put first and written as a date, an hour or a name.
 */
export function tableView(
  input: unknown,
  opts: {
    columns: unknown;
    x?: unknown;
    xKind?: unknown;
    xLabel?: unknown;
    currencyCode: string | null;
  }
): TableView {
  const dataset = requireDataset(input, 'table');
  type Chosen = { index: number; label: string; kind: string };
  const chosen: Chosen[] = [];

  if (typeof opts.x === 'string' && opts.x) {
    const kind = axisKind(opts.xKind);
    const fallback = kind === 'date' ? 'Date' : kind === 'hour' ? 'Hour' : opts.x;
    chosen.push({
      index: columnIndex(dataset, opts.x, 'table'),
      label: typeof opts.xLabel === 'string' && opts.xLabel ? opts.xLabel : fallback,
      kind,
    });
  }
  const asked = Array.isArray(opts.columns) ? opts.columns : opts.columns ? [opts.columns] : [];
  for (const item of asked as { column?: unknown; label?: unknown; kind?: unknown }[]) {
    if (!item || typeof item.column !== 'string') continue;
    chosen.push({
      index: columnIndex(dataset, item.column, 'table'),
      label: String(item.label ?? item.column),
      kind: typeof item.kind === 'string' ? item.kind : 'value',
    });
  }
  if (chosen.length === 0) throw new ChartError('table: name at least one column to show.');

  const isText = (column: Chosen) => dataset.columns[column.index].format === 'text';
  const lastRow = dataset.rows.length - 1;

  return {
    head: chosen.map((column, c) => ({
      label: column.label,
      cls: c > 0 && isText(column) ? 'text' : '',
    })),
    rows: dataset.rows.map((row, r) => ({
      total: dataset.totalRow && r === lastRow,
      cells: chosen.map((column, c) => {
        const cell = row[column.index] ?? null;
        const align = c > 0 && isText(column) ? 'text' : '';
        if (cell === null || cell === '') return { text: '—', cls: align };
        if (typeof cell === 'string') {
          const dated = column.kind === 'date' || column.kind === 'hour';
          return {
            text: dated ? axisLabel(cell, column.kind as AxisKind, true) : cell,
            cls: align,
          };
        }
        if (column.kind === 'hour') return { text: hourLabel(cell), cls: align };
        if (column.kind === 'change') {
          return { text: formatChange(cell), cls: cell > 0 ? 'up' : cell < 0 ? 'down' : '' };
        }
        const unit = dataset.columns[column.index].format;
        return {
          text: formatFigure(cell, unit === 'text' ? 'count' : unit, opts.currencyCode),
          cls: align,
        };
      }),
    })),
  };
}
