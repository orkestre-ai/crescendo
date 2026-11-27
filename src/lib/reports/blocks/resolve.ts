import { formatFigure } from '../ledger';
import type { ReportDataset, ReportFigure, ReportRun } from '../types';
import type { BlockInstance, Ledger, ResolvedDataset, ResolvedFigure } from './types';

/** Thrown when block data points at a figure or table the ledger does not hold. */
export class BlockDataError extends Error {}

/** {{fig:revenue_2026}} inside a text field: the figure, as the ledger shows it. */
export const FIGURE_TOKEN = /\{\{\s*fig:\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** The one figure Crescendo keeps itself: the email addresses it removed from query results. */
export const EMAILS_REMOVED = 'emails_removed';

/**
 * The ledger a run's blocks read from: the figures and tables the model
 * recorded, and the count of removed email addresses, which no query holds
 * and the model must not type.
 */
export function runLedger(
  run: Pick<ReportRun, 'id' | 'redactedEmailCount' | 'currencyCode'>,
  figures: ReportFigure[],
  datasets: ReportDataset[]
): Ledger {
  const removed: ReportFigure = {
    runId: run.id,
    key: EMAILS_REMOVED,
    label: 'Email addresses removed from query results',
    unit: 'count',
    value: run.redactedEmailCount,
    text: null,
    display: formatFigure(run.redactedEmailCount, 'count', run.currencyCode),
    source: {
      kind: 'stated',
      value: run.redactedEmailCount,
      reason: 'Counted by Crescendo as query results arrived.',
    },
    queryKeys: [],
    recheckStatus: 'stated',
    previousValue: null,
  };
  return { figures: [...figures, removed], datasets, currencyCode: run.currencyCode };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** { "figure": "<key>" }: the only way a number reaches a block. */
export function figureRef(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'figure' && typeof value.figure === 'string'
    ? value.figure
    : null;
}

/** { "dataset": "<key>" }: a table or a series. */
export function datasetRef(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'dataset' && typeof value.dataset === 'string'
    ? value.dataset
    : null;
}

function resolveFigure(key: string, ledger: Ledger): ResolvedFigure {
  const figure = ledger.figures.find((f) => f.key === key);
  if (!figure) throw new BlockDataError(`There is no figure "${key}" in the ledger.`);
  return {
    value: figure.value,
    display: figure.display,
    label: figure.label,
    unit: figure.unit,
    recheckStatus: figure.recheckStatus,
  };
}

function resolveDataset(key: string, ledger: Ledger): ResolvedDataset {
  const dataset = ledger.datasets.find((d) => d.key === key);
  if (!dataset) throw new BlockDataError(`There is no dataset "${key}" in the ledger.`);
  return {
    columns: dataset.columns,
    rows: dataset.rows,
    label: dataset.label,
    totalRow: dataset.spec?.totalRow === true,
  };
}

/**
 * Swap every reference in a block's data for what the ledger holds: a figure
 * reference becomes { value, display, label, unit, recheckStatus }, a dataset
 * reference becomes { columns, rows, label, totalRow }, and {{fig:key}} in
 * any text becomes the figure as the ledger shows it.
 */
export function resolveBlockData(data: unknown, ledger: Ledger): unknown {
  if (typeof data === 'string') {
    return data.replace(FIGURE_TOKEN, (_, key: string) => resolveFigure(key, ledger).display);
  }
  if (Array.isArray(data)) return data.map((item) => resolveBlockData(item, ledger));
  if (!isPlainObject(data)) return data;

  const figure = figureRef(data);
  if (figure !== null) return resolveFigure(figure, ledger);
  const dataset = datasetRef(data);
  if (dataset !== null) return resolveDataset(dataset, ledger);

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, resolveBlockData(value, ledger)])
  );
}

/** Every text field of a block's data, with its place as a JSON pointer. */
export function textFields(data: unknown, path = ''): { path: string; text: string }[] {
  if (typeof data === 'string') return [{ path, text: data }];
  if (Array.isArray(data)) return data.flatMap((item, i) => textFields(item, `${path}/${i}`));
  if (!isPlainObject(data) || figureRef(data) !== null || datasetRef(data) !== null) return [];
  return Object.entries(data).flatMap(([key, value]) => textFields(value, `${path}/${key}`));
}

/** The blocks of a run, read from its stored JSON. */
export function runBlocks(blocks: unknown[]): BlockInstance[] {
  return blocks.filter(
    (block): block is BlockInstance =>
      isPlainObject(block) && typeof block.id === 'string' && typeof block.block === 'string'
  );
}
