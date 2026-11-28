import { tool, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { redactEmails } from '@/lib/ai-tools/redact';
import { EMAILS_REMOVED, runBlocks, runLedger } from './blocks/resolve';
import type { BlockDef, BlockInstance, Ledger } from './blocks/types';
import { validateBlockData } from './blocks/validate';
import {
  computeDataset,
  computeFigure,
  datasetQueryKeys,
  formatFigure,
  LedgerError,
  queryTable,
  type LedgerContext,
} from './ledger';
import type { ReportStore } from './store';
import {
  UNITS,
  type DatasetSpec,
  type FigureSource,
  type ReportEventType,
  type ReportFigure,
  type Unit,
} from './types';

/** What the run loop reads after each step to know the model asked to stop. */
export interface RunSignals {
  finish?: { summary: string };
  attention?: { reason: string };
  /** Set once the recheck has run: no new queries after that. */
  queriesClosed?: boolean;
}

const KEY = /^[a-z][a-z0-9_]*$/;
const DATASET_PREVIEW_ROWS = 50;
const READ_QUERY_DEFAULT_ROWS = 100;
const READ_QUERY_MAX_ROWS = 1000;

const rowMatchSchema = z.object({
  column: z.string().describe('A column of the query'),
  op: z
    .enum(['=', '!=', 'contains', 'in', '>=', '<='])
    .describe('Text is compared exactly, with case. ">=" and "<=" compare numbers as numbers'),
  value: z
    .union([z.string(), z.array(z.string())])
    .describe('One value, or a list of values for "in"'),
});

const unitSchema = z
  .enum(UNITS)
  .describe(
    'How the value is written. "percent" takes a fraction: 0.25 is shown as 25.0%, so never multiply by 100'
  );

const figureSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cell'),
    query: z.string().describe('A saved query key, such as "q3"'),
    column: z.string(),
    where: z.array(rowMatchSchema).describe('Conditions that pick exactly one row'),
  }),
  z.object({
    kind: z.literal('aggregate'),
    query: z.string().describe('A saved query key, such as "q3"'),
    column: z.string(),
    agg: z.enum(['sum', 'avg', 'min', 'max', 'count']),
    where: z.array(rowMatchSchema).optional().describe('Leave out to use every row'),
  }),
  z.object({
    kind: z.literal('formula'),
    expr: z.string().describe('Arithmetic over names: numbers, + - * / and parentheses only'),
    refs: z
      .record(z.string(), z.string())
      .describe('Each name used in expr, mapped to the key of a recorded figure'),
  }),
  z.object({
    kind: z.literal('stated'),
    value: z.union([z.number(), z.string()]),
    reason: z.string().min(1).describe('Why no query can produce this'),
  }),
]);

const datasetSpecSchema = z.object({
  from: z.string().describe('The saved query the rows come from'),
  select: z
    .array(
      z.object({
        column: z.string(),
        as: z.string().optional().describe('A new name: letters, digits and underscores'),
        format: z.enum(UNITS).optional().describe('Default "text". Give every number column one'),
      })
    )
    .min(1),
  where: z.array(rowMatchSchema).optional(),
  join: z
    .array(
      z.object({
        query: z.string().describe('Another saved query, or the same one with a different where'),
        on: z.string().describe('A column both queries have, unique in the joined rows'),
        where: z.array(rowMatchSchema).optional(),
        select: z.array(
          z.object({ column: z.string(), as: z.string(), format: z.enum(UNITS).optional() })
        ),
      })
    )
    .optional(),
  computed: z
    .array(
      z.object({
        as: z.string(),
        expr: z.string().describe('Arithmetic over the number columns before it'),
        format: z.enum(UNITS).optional().describe('Default "ratio"'),
      })
    )
    .optional(),
  sort: z.array(z.object({ column: z.string(), desc: z.boolean().optional() })).optional(),
  limit: z.number().int().min(1).optional(),
  cumulative: z
    .array(z.string())
    .optional()
    .describe('Number columns to turn into running totals, in the sorted order'),
  totalRow: z.boolean().optional().describe('Add a total as the last row'),
});

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Split what a data tool returned into the part worth saving. Registry tools
 * return { data, summary }; anything else is saved whole. Email addresses
 * are removed before anything is stored or shown to the model.
 */
export function shapeToolOutput(output: unknown): {
  data: unknown;
  summary: string;
  redactedEmails: number;
} {
  const wrapped = (output ?? {}) as { data?: unknown; summary?: unknown; error?: unknown };
  if (typeof wrapped.error === 'string' && wrapped.error) throw new Error(wrapped.error);

  const raw = wrapped.data !== undefined ? wrapped.data : output;
  const { rows, count } = redactEmails([raw]);
  const already = Number((raw as { redactedEmails?: unknown } | null)?.redactedEmails) || 0;
  return {
    data: rows[0],
    summary: typeof wrapped.summary === 'string' ? wrapped.summary : '',
    redactedEmails: count + already,
  };
}

/** Run a data tool as the AI SDK would, outside a model step. */
export async function runDataTool(
  dataTool: Tool,
  params: unknown,
  toolCallId: string
): Promise<unknown> {
  if (!dataTool.execute) throw new Error('This tool cannot be run by Crescendo.');
  return await dataTool.execute(params, { toolCallId, messages: [] });
}

/**
 * Wrap a data tool so each result is saved as a ReportQuery and returned to
 * the model with its `query` key.
 */
export function withQueryLog(name: string, dataTool: Tool, store: ReportStore, runId: string) {
  return {
    ...dataTool,
    execute: async (params: unknown, options: { toolCallId: string }) => {
      const output = await runDataTool(dataTool, params, options.toolCallId);
      const { data, summary, redactedEmails } = shapeToolOutput(output);
      const flags = (data ?? {}) as { sampled?: unknown; samplingNote?: unknown };

      const saved = await store.saveQuery(runId, {
        tool: name,
        params,
        result: data,
        rowCount: queryTable(data).rows.length,
        sampled: flags.sampled === true,
        samplingNote: typeof flags.samplingNote === 'string' ? flags.samplingNote : null,
      });
      if (redactedEmails > 0) {
        const run = await store.getRun(runId);
        await store.updateRun(runId, {
          redactedEmailCount: (run?.redactedEmailCount ?? 0) + redactedEmails,
        });
      }
      await store.appendEvent(
        runId,
        'query',
        `${saved.key}: ${name}${summary ? `, ${summary}` : ''}`,
        {
          query: saved.key,
          tool: name,
          params,
        }
      );

      return { query: saved.key, data, summary };
    },
  } as Tool;
}

/** The figures a formula reads, and through them every figure those read. */
function reads(figures: ReportFigure[], source: FigureSource, seen = new Set<string>()) {
  if (source.kind !== 'formula') return seen;
  for (const key of Object.values(source.refs)) {
    if (seen.has(key)) continue;
    seen.add(key);
    const next = figures.find((figure) => figure.key === key);
    if (next) reads(figures, next.source, seen);
  }
  return seen;
}

/**
 * Formula figures in an order where each comes after the figures it reads,
 * so they can be worked out one after another. `cyclic` holds any that read
 * each other in a circle.
 */
export function orderFigures(figures: ReportFigure[]): {
  ordered: ReportFigure[];
  cyclic: ReportFigure[];
} {
  const ordered: ReportFigure[] = [];
  let waiting = [...figures];
  while (waiting.length) {
    const ready = waiting.filter(
      (figure) =>
        figure.source.kind !== 'formula' ||
        Object.values(figure.source.refs).every(
          (key) => ordered.some((f) => f.key === key) || !figures.some((f) => f.key === key)
        )
    );
    if (ready.length === 0) break;
    ordered.push(...ready);
    waiting = waiting.filter((figure) => !ready.includes(figure));
  }
  return { ordered, cyclic: waiting };
}

/** The saved queries a figure rests on, through any figures it reads. */
export function figureQueryKeys(source: FigureSource, figures: ReportFigure[]): string[] {
  if (source.kind === 'cell' || source.kind === 'aggregate') return [source.query];
  if (source.kind === 'stated') return [];
  const keys = Object.values(source.refs).flatMap(
    (key) => figures.find((figure) => figure.key === key)?.queryKeys ?? []
  );
  return [...new Set(keys)];
}

async function loadContext(
  store: ReportStore,
  runId: string,
  queryKeys: string[],
  figures: ReportFigure[]
): Promise<LedgerContext> {
  const ctx: LedgerContext = { queries: {}, figures: {} };
  for (const key of queryKeys) {
    const query = await store.getQuery(runId, key);
    if (query) ctx.queries[key] = queryTable(query.result);
  }
  for (const figure of figures) ctx.figures[figure.key] = figure.value;
  return ctx;
}

/**
 * The tools of one run: the report tools, which are always on, and the
 * definition's data tools, each logging its queries. Calls run one at a time
 * in the order the model made them, so a formula can read a figure recorded
 * in the same step and query keys follow the order of the calls.
 */
export function createReportTools(
  store: ReportStore,
  runId: string,
  dataTools: Record<string, Tool>,
  opts: { currencyCode: string | null }
): { tools: ToolSet; signals: RunSignals } {
  const signals: RunSignals = {};

  let last: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const next = last.then(work, work);
    last = next.catch(() => undefined);
    return next;
  };

  // A failed call goes back to the model as { error }, so it can fix the call.
  const guarded =
    <I, O>(name: string, work: (input: I, options: { toolCallId: string }) => Promise<O>) =>
    (input: I, options: { toolCallId: string }) =>
      inTurn(async () => {
        try {
          return await work(input, options);
        } catch (err) {
          const message = errorMessage(err);
          await store.appendEvent(runId, 'tool_error', `${name}: ${message}`);
          return { error: message };
        }
      });

  const log = (type: ReportEventType, message: string, data?: unknown) =>
    store.appendEvent(runId, type, message, data);

  const recordFigure = tool({
    description:
      'Record one figure in the ledger. You say where it comes from; Crescendo computes the value and returns it. Recording a key again replaces it.',
    inputSchema: z.object({
      key: z.string().describe('Lower-case letters, digits and underscores, e.g. "revenue_2026"'),
      label: z.string().describe('What the figure is, as a reader would see it'),
      unit: unitSchema,
      source: figureSourceSchema,
    }),
    execute: guarded(
      'record_figure',
      async (input: { key: string; label: string; unit: Unit; source: FigureSource }) => {
        const { key, label, unit, source } = input;
        if (!KEY.test(key)) {
          throw new LedgerError(
            `"${key}" cannot be a figure key. Use lower-case letters, digits and underscores, starting with a letter.`
          );
        }
        if (key === EMAILS_REMOVED) {
          throw new LedgerError(
            `Crescendo keeps "${EMAILS_REMOVED}" itself: the email addresses it removed from query results. Use {{fig:${EMAILS_REMOVED}}} in the wording; do not record it.`
          );
        }
        if (unit === 'text' && source.kind !== 'cell' && source.kind !== 'stated') {
          throw new LedgerError('A text figure comes from a cell or is stated.');
        }
        if (source.kind === 'stated' && (typeof source.value === 'string') !== (unit === 'text')) {
          throw new LedgerError(
            'A stated figure with unit "text" takes text; every other unit takes a number.'
          );
        }

        const figures = await store.listFigures(runId);
        if (reads(figures, source).has(key)) {
          throw new LedgerError(`Figure "${key}" cannot be worked out from itself.`);
        }
        const queryKeys = figureQueryKeys(source, figures);
        const ctx = await loadContext(store, runId, queryKeys, figures);
        const { value, text, rows } = computeFigure(source, ctx, unit);
        const figure: ReportFigure = {
          runId,
          key,
          label,
          unit,
          value,
          text,
          display: formatFigure(value ?? text, unit, opts.currencyCode),
          source,
          queryKeys,
          recheckStatus: source.kind === 'stated' ? 'stated' : 'unchecked',
          previousValue: null,
        };
        await store.upsertFigure(figure);
        await log('figure', `${key} = ${figure.display} (${label})`, { figure: key });

        // Figures worked out from this one follow it.
        const all = [...figures.filter((f) => f.key !== key), figure];
        ctx.figures[key] = value;
        const updated: { key: string; display?: string; error?: string }[] = [];
        for (const other of orderFigures(all).ordered) {
          if (other.key === key || !reads(all, other.source).has(key)) continue;
          try {
            other.value = computeFigure(other.source, ctx, other.unit).value;
          } catch (err) {
            updated.push({ key: other.key, error: errorMessage(err) });
            continue;
          }
          ctx.figures[other.key] = other.value;
          other.display = formatFigure(other.value, other.unit, opts.currencyCode);
          other.queryKeys = figureQueryKeys(other.source, all);
          await store.upsertFigure(other);
          updated.push({ key: other.key, display: other.display });
        }

        return {
          key,
          value: value ?? text,
          display: figure.display,
          ...(source.kind === 'cell' || source.kind === 'aggregate' ? { rowsRead: rows } : {}),
          ...(source.kind === 'stated' && {
            note: 'Stated figures are listed in the report as not machine-checked.',
          }),
          ...(updated.length > 0 && { alsoUpdated: updated }),
        };
      }
    ),
  });

  const defineDataset = tool({
    description:
      'Define a table in the ledger from saved queries: pick columns, filter, join, add computed columns, sort, limit, keep running totals, add a total row. Crescendo computes it and returns it. Defining a key again replaces it.',
    inputSchema: z.object({
      key: z.string().describe('Lower-case letters, digits and underscores'),
      label: z.string().describe('What the table shows'),
      spec: datasetSpecSchema,
    }),
    execute: guarded(
      'define_dataset',
      async (input: { key: string; label: string; spec: DatasetSpec }) => {
        const { key, label, spec } = input;
        if (!KEY.test(key)) {
          throw new LedgerError(
            `"${key}" cannot be a dataset key. Use lower-case letters, digits and underscores, starting with a letter.`
          );
        }
        const ctx = await loadContext(store, runId, datasetQueryKeys(spec), []);
        const { columns, rows } = computeDataset(spec, ctx);
        await store.upsertDataset({ runId, key, label, spec, columns, rows });
        await log('dataset', `${key}: ${rows.length} rows, ${columns.length} columns (${label})`, {
          dataset: key,
        });
        return {
          key,
          columns,
          rowCount: rows.length,
          rows: rows.slice(0, DATASET_PREVIEW_ROWS),
          ...(rows.length > DATASET_PREVIEW_ROWS && {
            note: `Showing the first ${DATASET_PREVIEW_ROWS} rows. All ${rows.length} are saved.`,
          }),
        };
      }
    ),
  });

  const readQuery = tool({
    description:
      'Read the rows of a saved query again, for example after its result was cleared from this conversation to save space.',
    inputSchema: z.object({
      query: z.string().describe('A saved query key, such as "q3"'),
      offset: z.number().int().min(0).optional().describe('Rows to skip. Default 0'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(READ_QUERY_MAX_ROWS)
        .optional()
        .describe(`Rows to return. Default ${READ_QUERY_DEFAULT_ROWS}`),
    }),
    execute: guarded(
      'read_query',
      async (input: { query: string; offset?: number; limit?: number }) => {
        const saved = await store.getQuery(runId, input.query);
        if (!saved) throw new LedgerError(`There is no saved query "${input.query}".`);
        const offset = input.offset ?? 0;
        const limit = input.limit ?? READ_QUERY_DEFAULT_ROWS;
        const { headers, rows } = queryTable(saved.result);
        const slice = rows.slice(offset, offset + limit);
        await log('tool', `read_query ${saved.key}, ${slice.length} rows from row ${offset + 1}`);
        return {
          query: saved.key,
          tool: saved.tool,
          params: saved.params,
          headers,
          rowCount: saved.rowCount,
          offset,
          rows: slice,
          sampled: saved.sampled,
          samplingNote: saved.samplingNote,
        };
      }
    ),
  });

  const note = tool({
    description:
      'Write a note into the run: a finding, a doubt, a decision about method, or a summary of progress. A person following the run reads notes as they arrive.',
    inputSchema: z.object({ text: z.string().min(1) }),
    execute: guarded('note', async (input: { text: string }) => {
      await log('note', input.text);
      return { ok: true };
    }),
  });

  // Blocks: the document, in page order
  const readBlocks = async () => runBlocks((await store.getRun(runId))?.blocks ?? []);
  const readLedger = async (): Promise<Ledger> =>
    runLedger(
      {
        id: runId,
        redactedEmailCount: (await store.getRun(runId))?.redactedEmailCount ?? 0,
        currencyCode: opts.currencyCode,
      },
      await store.listFigures(runId),
      await store.listDatasets(runId)
    );
  const usableBlocks = async () =>
    (await store.listBlockDefs()).filter((def) => def.isCurrent && def.status !== 'disabled');

  // The issues go back to the model as text, so it can fix the data and try again.
  const checkBlockData = async (def: BlockDef, data: unknown, action: string) => {
    const issues = validateBlockData(def, data, await readLedger());
    if (issues.length > 0) {
      throw new LedgerError(
        `The block was not ${action}. Fix this and call the tool again:\n${issues
          .map((issue) => `- ${issue.message}`)
          .join('\n')}`
      );
    }
  };

  const blockData = z
    .record(z.string(), z.unknown())
    .describe(
      'The block\'s data, in the shape list_blocks gives for it. A slot marked "x-ref": "figure" takes { "figure": "<figure key>" }; one marked "x-ref": "dataset" takes { "dataset": "<dataset key>" }. Never a number'
    );

  const listBlocks = tool({
    description:
      "List the blocks a report can be built from: each one's key, what it is for, and the shape of data it takes. Call this before the first add_block.",
    inputSchema: z.object({}),
    execute: guarded('list_blocks', async () => {
      const defs = await usableBlocks();
      await log('tool', `list_blocks: ${defs.length} blocks`);
      return {
        blocks: defs.map((def) => ({
          key: def.key,
          name: def.name,
          description: def.description,
          dataSchema: def.dataSchema,
        })),
        references:
          'In block data, a number is never typed. A slot marked "x-ref": "figure" takes { "figure": "<key>" }; a slot marked "x-ref": "dataset" takes { "dataset": "<key>" }. Inside any text, {{fig:<key>}} is replaced by that figure as the ledger shows it.',
      };
    }),
  });

  const addBlock = tool({
    description:
      'Add a block to the report. It is checked against the ledger and drawn once before it is kept; if something is wrong you are told what. Blocks appear in the order they are added, unless "after" names the block to follow.',
    inputSchema: z.object({
      block: z.string().describe('A block key from list_blocks, e.g. "stat_tiles"'),
      data: blockData,
      after: z
        .string()
        .optional()
        .describe('The id of the block this one follows, e.g. "b3". Leave out to add at the end'),
    }),
    execute: guarded(
      'add_block',
      async (input: { block: string; data: Record<string, unknown>; after?: string }) => {
        const defs = await usableBlocks();
        const def = defs.find((d) => d.key === input.block);
        if (!def) {
          throw new LedgerError(
            `There is no block "${input.block}". Blocks: ${defs.map((d) => d.key).join(', ')}.`
          );
        }
        const blocks = await readBlocks();
        const at = input.after ? blocks.findIndex((b) => b.id === input.after) : blocks.length - 1;
        if (input.after && at === -1) {
          throw new LedgerError(
            `There is no block with id "${input.after}". Blocks so far: ${blocks.map((b) => b.id).join(', ') || 'none'}.`
          );
        }
        await checkBlockData(def, input.data, 'added');

        const last = Math.max(0, ...blocks.map((b) => Number(b.id.slice(1)) || 0));
        const added: BlockInstance = {
          id: `b${last + 1}`,
          block: def.key,
          version: def.version,
          data: input.data,
        };
        blocks.splice(at + 1, 0, added);
        await store.updateRun(runId, { blocks });
        await log('tool', `add_block ${added.id}: ${def.key}`, { block: added.id });
        return { id: added.id, position: at + 2, blocks: blocks.length };
      }
    ),
  });

  const updateBlock = tool({
    description:
      'Replace the data of a block already in the report, for example to revise its wording. It is checked the same way as add_block.',
    inputSchema: z.object({
      id: z.string().describe('The block id add_block returned, e.g. "b3"'),
      data: blockData,
    }),
    execute: guarded(
      'update_block',
      async (input: { id: string; data: Record<string, unknown> }) => {
        const blocks = await readBlocks();
        const found = blocks.find((b) => b.id === input.id);
        if (!found) throw new LedgerError(`There is no block with id "${input.id}".`);
        const defs = await store.listBlockDefs();
        const def =
          defs.find((d) => d.key === found.block && d.version === found.version) ??
          defs.find((d) => d.key === found.block && d.isCurrent);
        if (!def) throw new LedgerError(`The block "${found.block}" is no longer available.`);
        await checkBlockData(def, input.data, 'updated');

        found.data = input.data;
        await store.updateRun(runId, { blocks });
        await log('tool', `update_block ${found.id}: ${found.block}`, { block: found.id });
        return { id: found.id, ok: true };
      }
    ),
  });

  const removeBlock = tool({
    description: 'Take a block out of the report.',
    inputSchema: z.object({ id: z.string().describe('The block id, e.g. "b3"') }),
    execute: guarded('remove_block', async (input: { id: string }) => {
      const blocks = await readBlocks();
      const kept = blocks.filter((b) => b.id !== input.id);
      if (kept.length === blocks.length) {
        throw new LedgerError(`There is no block with id "${input.id}".`);
      }
      await store.updateRun(runId, { blocks: kept });
      await log('tool', `remove_block ${input.id}`, { block: input.id });
      return { id: input.id, blocks: kept.length };
    }),
  });

  const finishReport = tool({
    description:
      'Say the report is finished. It must have at least one block. Crescendo then re-runs every saved query and recomputes the ledger. If a figure changed you are told, and get a short turn to revise.',
    inputSchema: z.object({
      summary: z.string().min(1).describe('Two or three sentences on what the report found'),
    }),
    execute: guarded('finish_report', async (input: { summary: string }) => {
      if ((await readBlocks()).length === 0) {
        throw new LedgerError(
          'The report has no blocks yet, so there is nothing to read. Build the document with list_blocks and add_block, then call finish_report again.'
        );
      }
      signals.finish = { summary: input.summary };
      await log('summary', input.summary);
      return { ok: true };
    }),
  });

  const needsAttention = tool({
    description:
      'Stop the run because it cannot continue and a person has to step in: tracking is broken, the data needed does not exist, or the instructions cannot be followed. The run ends at once and cannot be resumed.',
    inputSchema: z.object({
      reason: z.string().min(1).describe('What is wrong, in plain words, for the person'),
    }),
    execute: guarded('needs_attention', async (input: { reason: string }) => {
      signals.attention = { reason: input.reason };
      return { ok: true };
    }),
  });

  const logged = Object.fromEntries(
    Object.entries(dataTools).map(([name, dataTool]) => {
      const withLog = withQueryLog(name, dataTool, store, runId);
      const execute = guarded(name, async (params: unknown, options: { toolCallId: string }) => {
        if (signals.queriesClosed) {
          throw new Error(
            'The saved queries have been rechecked and no new ones can be run. Work from the ledger and read_query.'
          );
        }
        return await withLog.execute!(params, { ...options, messages: [] });
      });
      return [name, { ...dataTool, execute } as Tool];
    })
  );

  return {
    signals,
    tools: {
      ...logged,
      record_figure: recordFigure,
      define_dataset: defineDataset,
      read_query: readQuery,
      list_blocks: listBlocks,
      add_block: addBlock,
      update_block: updateBlock,
      remove_block: removeBlock,
      note,
      finish_report: finishReport,
      needs_attention: needsAttention,
    },
  };
}
