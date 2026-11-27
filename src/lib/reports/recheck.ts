import type { Tool } from 'ai';
import { allTools } from '@/lib/ai/tools';
import {
  computeDataset,
  computeFigure,
  datasetQueryKeys,
  formatFigure,
  queryTable,
  type LedgerContext,
} from './ledger';
import type { ReportStore } from './store';
import { orderFigures, runDataTool, shapeToolOutput } from './tools';
import type { QueryRecheck, ReportWarning } from './types';

export interface RecheckResult {
  changedQueries: string[];
  changedFigures: {
    key: string;
    before: number | null;
    after: number | null;
    /** The same two values as a reader sees them; a text figure has only these. */
    beforeDisplay: string;
    afterDisplay: string;
  }[];
  changedDatasets: string[];
}

const SAMPLE_ROWS = 20;
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

// GA4 sums decimals in floating point, so the same revenue can come back as
// 98288.260012 one time and 98288.260012000013 the next. Six decimal places
// is far below a cent and far above that noise.
const DECIMAL = /^-?\d+\.\d+$/;
const steady = (value: unknown) =>
  typeof value === 'string' && DECIMAL.test(value) ? Number(value).toFixed(6) : value;

// One line per row with its keys in a fixed order, so row order does not matter.
function canonicalRows(result: unknown): string[] {
  return queryTable(result)
    .rows.map((row) =>
      JSON.stringify(
        Object.entries(row)
          .map(([key, value]): [string, unknown] => [key, steady(value)])
          .sort(([a], [b]) => (a < b ? -1 : 1))
      )
    )
    .sort();
}

function compareRows(before: string[], after: string[]) {
  const count = (rows: string[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row, (counts.get(row) ?? 0) + 1);
    return counts;
  };
  // Rows of `rows` that `other` does not have, counting repeats.
  const missing = (rows: string[], other: Map<string, number>) => {
    const left = new Map(other);
    return rows.filter((row) => {
      const n = left.get(row) ?? 0;
      left.set(row, n - 1);
      return n <= 0;
    });
  };
  const removed = missing(before, count(after));
  const added = missing(after, count(before));
  const sample = (rows: string[]) =>
    rows.slice(0, SAMPLE_ROWS).map((row) => Object.fromEntries(JSON.parse(row)));
  return {
    matched: removed.length === 0 && added.length === 0,
    removed: sample(removed),
    added: sample(added),
  };
}

/**
 * Re-run every saved query of a run with its stored params, compare the rows
 * with the first run, then recompute every dataset and figure from the new
 * results. The comparison is exact apart from floating-point noise in GA4's
 * decimals: any real difference corrects the figures that rest on it. A query that cannot be run again keeps its first result, and
 * its figures stay unchecked.
 *
 * `tools` are the data tools by key; it defaults to the shared registry.
 */
export async function recheckRun(
  runId: string,
  store: ReportStore,
  tools: Record<string, Tool> = allTools
): Promise<RecheckResult> {
  const run = await store.getRun(runId);
  if (!run) throw new Error(`No report run with id ${runId}`);

  const warnings: ReportWarning[] = [];
  const warn = async (message: string) => {
    warnings.push({ kind: 'recheck', message });
    await store.appendEvent(runId, 'warning', message);
  };

  // 1. The queries.
  const ctx: LedgerContext = { queries: {}, figures: {} };
  const changedQueries: string[] = [];
  const failed = new Set<string>();
  for (const query of await store.listQueries(runId)) {
    const checkedAt = new Date().toISOString();
    const before = canonicalRows(query.result);
    try {
      const dataTool = tools[query.tool];
      if (!dataTool) throw new Error(`The tool "${query.tool}" is no longer available.`);
      const output = await runDataTool(dataTool, query.params, `recheck-${query.key}`);
      const { data } = shapeToolOutput(output);
      const after = canonicalRows(data);
      const flags = (data ?? {}) as { sampled?: unknown; samplingNote?: unknown };
      const recheck: QueryRecheck = {
        checkedAt,
        rowsBefore: before.length,
        rowsAfter: after.length,
        ...compareRows(before, after),
      };
      // Rows that match keep the order of the first run, so a table built
      // from them does not move just because GA4 answered in another order.
      await store.updateQuery(runId, query.key, {
        ...(!recheck.matched && {
          result: data,
          rowCount: after.length,
          sampled: flags.sampled === true,
          samplingNote: typeof flags.samplingNote === 'string' ? flags.samplingNote : null,
        }),
        recheck,
      });
      ctx.queries[query.key] = queryTable(recheck.matched ? query.result : data);
      if (!recheck.matched) changedQueries.push(query.key);
    } catch (err) {
      failed.add(query.key);
      ctx.queries[query.key] = queryTable(query.result);
      await store.updateQuery(runId, query.key, {
        recheck: {
          checkedAt,
          matched: false,
          rowsBefore: before.length,
          rowsAfter: before.length,
          removed: [],
          added: [],
          error: errorMessage(err),
        },
      });
      await warn(
        `Query ${query.key} could not be run again, so its figures are not rechecked: ${errorMessage(err)}`
      );
    }
  }
  const rests = (queryKeys: string[]) => queryKeys.some((key) => failed.has(key));

  // 2. The datasets.
  const changedDatasets: string[] = [];
  for (const dataset of await store.listDatasets(runId)) {
    if (rests(datasetQueryKeys(dataset.spec))) continue;
    try {
      const { columns, rows } = computeDataset(dataset.spec, ctx);
      if (JSON.stringify([columns, rows]) === JSON.stringify([dataset.columns, dataset.rows])) {
        continue;
      }
      await store.upsertDataset({ ...dataset, columns, rows });
      changedDatasets.push(dataset.key);
    } catch (err) {
      await warn(
        `Dataset ${dataset.key} could not be recomputed and keeps its first result: ${errorMessage(err)}`
      );
    }
  }

  // 3. The figures, each after the figures it reads.
  const changedFigures: RecheckResult['changedFigures'] = [];
  const { ordered, cyclic } = orderFigures(await store.listFigures(runId));
  for (const figure of cyclic) {
    await warn(`Figure ${figure.key} reads itself through other figures and is not rechecked.`);
  }
  for (const figure of ordered) {
    ctx.figures[figure.key] = figure.value;
    if (figure.source.kind === 'stated' || rests(figure.queryKeys)) continue;

    let value: number | null = null;
    let text: string | null = null;
    try {
      ({ value, text } = computeFigure(figure.source, ctx, figure.unit));
    } catch (err) {
      await warn(
        `Figure ${figure.key} could not be recomputed from the second run: ${errorMessage(err)}`
      );
    }
    ctx.figures[figure.key] = value;

    if (value === figure.value && text === figure.text) {
      await store.upsertFigure({ ...figure, recheckStatus: 'matched' });
      continue;
    }
    const display = formatFigure(value ?? text, figure.unit, run.currencyCode);
    await store.upsertFigure({
      ...figure,
      value,
      text,
      display,
      recheckStatus: 'corrected',
      previousValue: figure.value,
    });
    changedFigures.push({
      key: figure.key,
      before: figure.value,
      after: value,
      beforeDisplay: figure.display,
      afterDisplay: display,
    });
  }

  if (warnings.length) {
    await store.updateRun(runId, { warnings: [...run.warnings, ...warnings] });
  }
  return { changedQueries, changedFigures, changedDatasets };
}
