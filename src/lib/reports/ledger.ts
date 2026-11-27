import {
  DivisionByZeroError,
  evaluateFormula,
  evaluateParsed,
  formulaNames,
  parseFormula,
} from './formula';
import type { Cell, Column, DatasetSpec, FigureSource, RowMatch, Unit } from './types';

/**
 * The ledger: every figure and table in a report is computed here, from the
 * rows of saved queries. The model says where a number comes from; it never
 * supplies the number.
 */

export class LedgerError extends Error {}

export interface QueryTable {
  headers: string[];
  rows: Record<string, string>[];
}

export interface LedgerContext {
  /** Saved query results by key ("q1", ...). */
  queries: Record<string, QueryTable>;
  /** Figure values by key, for formula refs. */
  figures: Record<string, number | null>;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Read the headers and rows out of a saved tool result. Rows may be objects
 * (ga4_report, ga4_funnel) or arrays beside a header list (ga4_query).
 */
export function queryTable(result: unknown): QueryTable {
  const data = (result ?? {}) as { headers?: unknown; rows?: unknown };
  const headers = Array.isArray(data.headers) ? data.headers.map(String) : [];
  const rawRows = Array.isArray(data.rows) ? data.rows : [];
  const rows = rawRows.map((row) => {
    const entries = Array.isArray(row)
      ? row.map((value, i) => [headers[i] ?? String(i), value])
      : Object.entries((row ?? {}) as object);
    return Object.fromEntries(entries.map(([key, value]) => [key, String(value ?? '')]));
  });
  return { headers: headers.length ? headers : Object.keys(rows[0] ?? {}), rows };
}

function table(ctx: LedgerContext, key: string): QueryTable {
  const found = ctx.queries[key];
  if (!found) throw new LedgerError(`There is no saved query "${key}".`);
  return found;
}

function requireColumn(source: QueryTable, column: string, query: string): void {
  if (!source.headers.includes(column)) {
    throw new LedgerError(
      `Query ${query} has no column "${column}". Its columns are: ${source.headers.join(', ')}.`
    );
  }
}

// GA4 returns numbers as strings. Number('') is 0, so an empty cell is refused too.
function toNumber(raw: string, column: string): number {
  const value = raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(value)) {
    throw new LedgerError(`Column "${column}" holds "${raw}", which is not a number.`);
  }
  return value;
}

function matches(row: Record<string, string>, match: RowMatch): boolean {
  const actual = row[match.column] ?? '';
  if (match.op === 'in') {
    if (!Array.isArray(match.value)) {
      throw new LedgerError(`A match with op "in" on "${match.column}" needs a list of values.`);
    }
    return match.value.includes(actual);
  }
  if (Array.isArray(match.value)) {
    throw new LedgerError(`A match with op "${match.op}" on "${match.column}" needs one value.`);
  }
  const wanted = match.value;
  switch (match.op) {
    case '=':
      return actual === wanted;
    case '!=':
      return actual !== wanted;
    case 'contains':
      return actual.includes(wanted);
    default: {
      // Numbers compare as numbers; anything else (a date, a name) as text.
      const a = Number(actual);
      const b = Number(wanted);
      const numeric = actual !== '' && wanted !== '' && Number.isFinite(a) && Number.isFinite(b);
      const order = numeric ? a - b : actual < wanted ? -1 : actual > wanted ? 1 : 0;
      return match.op === '>=' ? order >= 0 : order <= 0;
    }
  }
}

function matchRows(
  source: QueryTable,
  where: RowMatch[] | undefined,
  query: string
): Record<string, string>[] {
  if (!where?.length) return source.rows;
  for (const match of where) requireColumn(source, match.column, query);
  return source.rows.filter((row) => where.every((match) => matches(row, match)));
}

/**
 * Work out one figure. `rows` is how many rows of the query it read, so the
 * model can see a filter that matched nothing. With unit "text" a cell is
 * read as text; every other cell must be a number.
 */
export function computeFigure(
  source: FigureSource,
  ctx: LedgerContext,
  unit?: Unit
): { value: number | null; text: string | null; rows: number } {
  switch (source.kind) {
    case 'stated':
      return typeof source.value === 'number'
        ? { value: source.value, text: null, rows: 0 }
        : { value: null, text: source.value, rows: 0 };

    case 'cell': {
      const from = table(ctx, source.query);
      requireColumn(from, source.column, source.query);
      const rows = matchRows(from, source.where, source.query);
      if (rows.length !== 1) {
        throw new LedgerError(
          `A cell must match exactly one row; this one matched ${rows.length} of the ${from.rows.length} rows in ${source.query}. Change "where", or use an aggregate.`
        );
      }
      const raw = rows[0][source.column];
      return unit === 'text'
        ? { value: null, text: raw, rows: 1 }
        : { value: toNumber(raw, source.column), text: null, rows: 1 };
    }

    case 'aggregate': {
      const from = table(ctx, source.query);
      const rows = matchRows(from, source.where, source.query);
      if (source.agg === 'count') return { value: rows.length, text: null, rows: rows.length };

      requireColumn(from, source.column, source.query);
      const values = rows.map((row) => toNumber(row[source.column], source.column));
      const sum = values.reduce((total, value) => total + value, 0);
      if (source.agg === 'sum') return { value: sum, text: null, rows: rows.length };
      if (values.length === 0) {
        throw new LedgerError(
          `No rows of ${source.query} matched, so there is no ${source.agg} of "${source.column}".`
        );
      }
      const value =
        source.agg === 'avg'
          ? sum / values.length
          : source.agg === 'min'
            ? Math.min(...values)
            : Math.max(...values);
      return { value, text: null, rows: rows.length };
    }

    case 'formula': {
      const vars: Record<string, number> = {};
      for (const [name, figureKey] of Object.entries(source.refs)) {
        const value = ctx.figures[figureKey];
        if (value === undefined) {
          throw new LedgerError(
            `The formula refers to figure "${figureKey}", which has not been recorded.`
          );
        }
        if (value === null) {
          throw new LedgerError(`Figure "${figureKey}" has no number to use in a formula.`);
        }
        vars[name] = value;
      }
      return { value: evaluateFormula(source.expr, vars), text: null, rows: 0 };
    }
  }
}

/** The saved queries a dataset reads. */
export function datasetQueryKeys(spec: DatasetSpec): string[] {
  return [...new Set([spec.from, ...(spec.join ?? []).map((join) => join.query)])];
}

/**
 * Build a table from saved queries: select, filter, join, computed columns,
 * sort, limit, running totals and a total row. Nothing is rounded on the way.
 * With `totalRow`, the total is the last row.
 */
export function computeDataset(
  spec: DatasetSpec,
  ctx: LedgerContext
): { columns: Column[]; rows: Cell[][] } {
  const from = table(ctx, spec.from);
  const columns: Column[] = [];
  const addColumn = (key: string, format: Unit) => {
    if (!NAME.test(key)) {
      throw new LedgerError(
        `"${key}" cannot be a column name. Use letters, digits and underscores, and give the column an "as".`
      );
    }
    if (columns.some((column) => column.key === key)) {
      throw new LedgerError(`The dataset has two columns named "${key}". Give one an "as".`);
    }
    columns.push({ key, format });
  };
  const read = (raw: string | undefined, column: string, format: Unit): Cell =>
    raw === undefined ? null : format === 'text' ? raw : toNumber(raw, column);

  // Select, from the filtered rows of the first query.
  for (const pick of spec.select) {
    requireColumn(from, pick.column, spec.from);
    addColumn(pick.as ?? pick.column, pick.format ?? 'text');
  }
  const sourceRows = matchRows(from, spec.where, spec.from);
  let rows = sourceRows.map((row) => {
    const out: Record<string, Cell> = {};
    for (const pick of spec.select) {
      out[pick.as ?? pick.column] = read(row[pick.column], pick.column, pick.format ?? 'text');
    }
    return out;
  });

  // Join other queries on a key column. A row with no match gets empty cells.
  for (const join of spec.join ?? []) {
    const other = table(ctx, join.query);
    requireColumn(from, join.on, spec.from);
    requireColumn(other, join.on, join.query);
    for (const pick of join.select) {
      requireColumn(other, pick.column, join.query);
      addColumn(pick.as, pick.format ?? 'text');
    }
    const byKey = new Map<string, Record<string, string>>();
    for (const row of matchRows(other, join.where, join.query)) {
      if (byKey.has(row[join.on])) {
        throw new LedgerError(
          `Cannot join ${join.query} on "${join.on}": "${row[join.on]}" appears in more than one row. Narrow it with "where".`
        );
      }
      byKey.set(row[join.on], row);
    }
    rows.forEach((out, i) => {
      const match = byKey.get(sourceRows[i][join.on]);
      for (const pick of join.select) {
        out[pick.as] = read(match?.[pick.column], pick.column, pick.format ?? 'text');
      }
    });
  }

  // Computed columns. A cell whose inputs are missing, or that would divide
  // by zero, is left empty; a formula that does not parse refuses the dataset.
  const computed = (spec.computed ?? []).map((column) => {
    const tree = parseFormula(column.expr);
    for (const name of formulaNames(tree)) {
      const input = columns.find((c) => c.key === name);
      if (!input) {
        throw new LedgerError(
          `The computed column "${column.as}" uses "${name}", which is not a column before it.`
        );
      }
      if (input.format === 'text') {
        throw new LedgerError(
          `The computed column "${column.as}" uses "${name}", which is text. Give that column a number format.`
        );
      }
    }
    addColumn(column.as, column.format ?? 'ratio');
    return { key: column.as, tree };
  });
  const compute = (out: Record<string, Cell>) => {
    for (const { key, tree } of computed) {
      const vars: Record<string, number> = {};
      let complete = true;
      for (const name of formulaNames(tree)) {
        const value = out[name];
        if (typeof value === 'number') vars[name] = value;
        else complete = false;
      }
      try {
        out[key] = complete ? evaluateParsed(tree, vars) : null;
      } catch (err) {
        if (!(err instanceof DivisionByZeroError)) throw err;
        out[key] = null;
      }
    }
  };
  rows.forEach(compute);

  // Sort, with empty cells last, then limit.
  for (const order of spec.sort ?? []) {
    if (!columns.some((column) => column.key === order.column)) {
      throw new LedgerError(`Cannot sort by "${order.column}": it is not a column of the dataset.`);
    }
  }
  if (spec.sort?.length) {
    rows = [...rows].sort((a, b) => {
      for (const { column, desc } of spec.sort!) {
        const left = a[column];
        const right = b[column];
        if (left === right) continue;
        if (left === null) return 1;
        if (right === null) return -1;
        const order =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left) < String(right)
              ? -1
              : 1;
        return desc ? -order : order;
      }
      return 0;
    });
  }
  if (spec.limit !== undefined) rows = rows.slice(0, Math.max(Math.trunc(spec.limit), 0));

  // The total row: counts and money add up; a rate cannot be added, so a
  // selected rate is left empty and a computed one is worked out again from
  // the totals.
  let total: Record<string, Cell> | null = null;
  if (spec.totalRow) {
    total = {};
    const label = columns.find((column) => column.format === 'text');
    for (const column of columns) {
      if (computed.some((c) => c.key === column.key)) continue;
      if (column.format === 'count' || column.format === 'currency') {
        total[column.key] = rows.reduce(
          (sum, row) =>
            sum + (typeof row[column.key] === 'number' ? (row[column.key] as number) : 0),
          0
        );
      } else {
        total[column.key] = column === label ? 'Total' : null;
      }
    }
    compute(total);
  }

  // Running totals, in the sorted order.
  for (const key of spec.cumulative ?? []) {
    const column = columns.find((c) => c.key === key);
    if (!column || column.format === 'text') {
      throw new LedgerError(`Cannot keep a running total of "${key}": it is not a number column.`);
    }
    let running = 0;
    for (const row of rows) {
      if (typeof row[key] === 'number') running += row[key] as number;
      row[key] = running;
    }
  }

  const all = total ? [...rows, total] : rows;
  return { columns, rows: all.map((row) => columns.map((column) => row[column.key] ?? null)) };
}

const LOCALE = 'en-CA';

/**
 * How a figure is written in a report. A percent is stored as a fraction
 * (0.25 is shown as 25.0%). The model never supplies a formatted number.
 * `currencyDigits` fixes the decimals of a currency, for a table column
 * whose amounts must all be written alike.
 */
export function formatFigure(
  value: number | string | null,
  unit: Unit,
  currencyCode: string | null,
  currencyDigits?: 0 | 2
): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value;

  switch (unit) {
    case 'currency': {
      // Cents on small amounts, whole units from a thousand up.
      const digits = currencyDigits ?? (Math.abs(value) < 1000 ? 2 : 0);
      try {
        return new Intl.NumberFormat(LOCALE, {
          style: 'currency',
          currency: currencyCode || 'USD',
          currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(value);
      } catch {
        // An unknown currency code
        return `${value.toFixed(digits)} ${currencyCode}`;
      }
    }
    case 'percent':
      return new Intl.NumberFormat(LOCALE, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
    case 'ratio':
      return new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    default:
      return new Intl.NumberFormat(LOCALE, {
        maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
      }).format(value);
  }
}
