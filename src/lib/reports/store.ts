import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { builtinBlockDefs, ensureBuiltinBlocks } from './blocks/builtin';
import type { BlockDef } from './blocks/types';
import { parseInputFields } from './definitions/inputs';
import {
  ACTIVE_STATUSES,
  type DefinitionSnapshot,
  type ReportDataset,
  type ReportDefinition,
  type ReportEvent,
  type ReportEventType,
  type ReportFigure,
  type ReportQuery,
  type ReportRun,
  type ReportTrigger,
} from './types';

export interface NewReportRun {
  definitionId: string | null;
  definitionSnapshot: DefinitionSnapshot;
  title: string;
  preparedBy: string | null;
  inputs: Record<string, string>;
  /** Defaults to 'manual'. */
  trigger?: ReportTrigger;
}

export type ReportRunPatch = Partial<
  Pick<
    ReportRun,
    | 'status'
    | 'statusReason'
    | 'blocks'
    | 'warnings'
    | 'usage'
    | 'stepCount'
    | 'redactedEmailCount'
    | 'cancelRequested'
    | 'timeZone'
    | 'currencyCode'
    | 'startedAt'
    | 'completedAt'
  >
>;

export type NewReportQuery = Pick<
  ReportQuery,
  'tool' | 'params' | 'result' | 'rowCount' | 'sampled' | 'samplingNote'
>;

export type ReportQueryPatch = Partial<
  Pick<ReportQuery, 'result' | 'rowCount' | 'sampled' | 'samplingNote' | 'recheck'>
>;

/**
 * Everything the runner, the ledger and the recheck read and write. One run
 * has one writer at a time (the run loop), so nothing here locks.
 */
export interface ReportStore {
  findDefinition(where: { id: string } | { key: string }): Promise<ReportDefinition | null>;
  /** Every definition, in list order. */
  listDefinitions(): Promise<ReportDefinition[]>;

  createRun(data: NewReportRun): Promise<ReportRun>;
  getRun(id: string): Promise<ReportRun | null>;
  /** The run that is queued, running or rechecking, if there is one. */
  findActiveRun(): Promise<ReportRun | null>;
  updateRun(id: string, patch: ReportRunPatch): Promise<ReportRun>;
  /** Every run, newest first. */
  listRuns(): Promise<ReportRun[]>;
  /** The runs created at or after a moment, newest first. */
  listRunsSince(since: Date): Promise<ReportRun[]>;
  /** Removes a run with its queries, ledger and events. Nothing else deletes a run. */
  deleteRun(id: string): Promise<void>;

  appendEvent(
    runId: string,
    type: ReportEventType,
    message: string,
    data?: unknown
  ): Promise<ReportEvent>;
  listEvents(runId: string, after?: number): Promise<ReportEvent[]>;

  /** Saves a query under the next key: "q1", "q2", ... */
  saveQuery(runId: string, query: NewReportQuery): Promise<ReportQuery>;
  getQuery(runId: string, key: string): Promise<ReportQuery | null>;
  updateQuery(runId: string, key: string, patch: ReportQueryPatch): Promise<void>;
  listQueries(runId: string): Promise<ReportQuery[]>;

  upsertFigure(figure: ReportFigure): Promise<void>;
  listFigures(runId: string): Promise<ReportFigure[]>;

  upsertDataset(dataset: ReportDataset): Promise<void>;
  listDatasets(runId: string): Promise<ReportDataset[]>;

  /** Every stored block, in every version. The built-ins are seeded on first read. */
  listBlockDefs(): Promise<BlockDef[]>;
}

const json = (value: unknown) => value as Prisma.InputJsonValue;
const jsonOrNull = (value: unknown) =>
  value === null || value === undefined ? Prisma.JsonNull : json(value);

type RunRow = Prisma.ReportRunGetPayload<object>;
type QueryRow = Prisma.ReportQueryGetPayload<object>;
type FigureRow = Prisma.ReportFigureGetPayload<object>;
type DatasetRow = Prisma.ReportDatasetGetPayload<object>;
type EventRow = Prisma.ReportEventGetPayload<object>;
type DefinitionRow = Prisma.ReportDefinitionGetPayload<object>;
type BlockDefRow = Prisma.ReportBlockDefGetPayload<object>;

const toRun = (row: RunRow): ReportRun => ({
  id: row.id,
  definitionId: row.definitionId,
  definitionSnapshot: row.definitionSnapshot as unknown as ReportRun['definitionSnapshot'],
  status: row.status,
  statusReason: row.statusReason,
  title: row.title,
  preparedBy: row.preparedBy,
  trigger: row.trigger as ReportTrigger,
  inputs: row.inputs as ReportRun['inputs'],
  blocks: row.blocks as unknown[],
  warnings: row.warnings as unknown as ReportRun['warnings'],
  usage: row.usage as ReportRun['usage'],
  stepCount: row.stepCount,
  redactedEmailCount: row.redactedEmailCount,
  cancelRequested: row.cancelRequested,
  timeZone: row.timeZone,
  currencyCode: row.currencyCode,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  createdAt: row.createdAt,
});

const toQuery = (row: QueryRow): ReportQuery => ({
  runId: row.runId,
  key: row.key,
  tool: row.tool,
  params: row.params,
  result: row.result,
  rowCount: row.rowCount,
  sampled: row.sampled,
  samplingNote: row.samplingNote,
  recheck: row.recheck as ReportQuery['recheck'],
});

const toFigure = (row: FigureRow): ReportFigure => ({
  runId: row.runId,
  key: row.key,
  label: row.label,
  unit: row.unit as ReportFigure['unit'],
  value: row.value,
  text: row.text,
  display: row.display,
  source: row.source as unknown as ReportFigure['source'],
  queryKeys: row.queryKeys,
  recheckStatus: row.recheckStatus as ReportFigure['recheckStatus'],
  previousValue: row.previousValue,
});

const toDataset = (row: DatasetRow): ReportDataset => ({
  runId: row.runId,
  key: row.key,
  label: row.label,
  spec: row.spec as unknown as ReportDataset['spec'],
  columns: row.columns as unknown as ReportDataset['columns'],
  rows: row.rows as ReportDataset['rows'],
});

const toEvent = (row: EventRow): ReportEvent => ({
  runId: row.runId,
  seq: row.seq,
  type: row.type as ReportEventType,
  message: row.message,
  data: row.data,
  createdAt: row.createdAt,
});

const toDefinition = (row: DefinitionRow): ReportDefinition => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  prompt: row.prompt,
  inputs: parseInputFields(row.inputs),
  enabledTools: row.enabledTools,
  maxSteps: row.maxSteps,
  maxMinutes: row.maxMinutes,
  isDefault: row.isDefault,
  enabled: row.enabled,
  sortOrder: row.sortOrder,
  scheduleDailyAt: row.scheduleDailyAt,
});

const toBlockDef = (row: BlockDefRow): BlockDef => ({
  key: row.key,
  version: row.version,
  isCurrent: row.isCurrent,
  name: row.name,
  description: row.description,
  dataSchema: row.dataSchema as unknown as BlockDef['dataSchema'],
  template: row.template,
  css: row.css,
  sampleData: row.sampleData,
  origin: row.origin as BlockDef['origin'],
  status: row.status as BlockDef['status'],
});

export const prismaStore: ReportStore = {
  async findDefinition(where) {
    const row = await prisma.reportDefinition.findUnique({ where });
    return row && toDefinition(row);
  },

  async listDefinitions() {
    const rows = await prisma.reportDefinition.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDefinition);
  },

  async createRun(data) {
    const row = await prisma.reportRun.create({
      data: { ...data, definitionSnapshot: json(data.definitionSnapshot) },
    });
    return toRun(row);
  },

  async getRun(id) {
    const row = await prisma.reportRun.findUnique({ where: { id } });
    return row && toRun(row);
  },

  async findActiveRun() {
    const row = await prisma.reportRun.findFirst({
      where: { status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    return row && toRun(row);
  },

  async updateRun(id, patch) {
    const { usage, warnings, blocks, ...rest } = patch;
    const row = await prisma.reportRun.update({
      where: { id },
      data: {
        ...rest,
        ...(usage !== undefined && { usage: jsonOrNull(usage) }),
        ...(blocks !== undefined && { blocks: json(blocks) }),
        ...(warnings !== undefined && { warnings: json(warnings) }),
      },
    });
    return toRun(row);
  },

  async listRuns() {
    const rows = await prisma.reportRun.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toRun);
  },

  async listRunsSince(since) {
    const rows = await prisma.reportRun.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRun);
  },

  async deleteRun(id) {
    await prisma.reportRun.delete({ where: { id } });
  },

  async appendEvent(runId, type, message, data) {
    const last = await prisma.reportEvent.aggregate({ where: { runId }, _max: { seq: true } });
    const row = await prisma.reportEvent.create({
      data: {
        runId,
        seq: (last._max.seq ?? 0) + 1,
        type,
        message,
        ...(data !== undefined && { data: jsonOrNull(data) }),
      },
    });
    return toEvent(row);
  },

  async listEvents(runId, after = 0) {
    const rows = await prisma.reportEvent.findMany({
      where: { runId, seq: { gt: after } },
      orderBy: { seq: 'asc' },
    });
    return rows.map(toEvent);
  },

  async saveQuery(runId, query) {
    const count = await prisma.reportQuery.count({ where: { runId } });
    const row = await prisma.reportQuery.create({
      data: {
        ...query,
        runId,
        key: `q${count + 1}`,
        params: json(query.params),
        result: json(query.result),
      },
    });
    return toQuery(row);
  },

  async getQuery(runId, key) {
    const row = await prisma.reportQuery.findUnique({ where: { runId_key: { runId, key } } });
    return row && toQuery(row);
  },

  async updateQuery(runId, key, patch) {
    const { result, recheck, ...rest } = patch;
    await prisma.reportQuery.update({
      where: { runId_key: { runId, key } },
      data: {
        ...rest,
        ...(result !== undefined && { result: json(result) }),
        ...(recheck !== undefined && { recheck: jsonOrNull(recheck) }),
      },
    });
  },

  async listQueries(runId) {
    const rows = await prisma.reportQuery.findMany({ where: { runId } });
    // In the order they ran: q2 before q10.
    return rows.map(toQuery).sort((a, b) => Number(a.key.slice(1)) - Number(b.key.slice(1)));
  },

  async upsertFigure(figure) {
    const { runId, key, ...rest } = figure;
    const data = { ...rest, source: json(rest.source) };
    await prisma.reportFigure.upsert({
      where: { runId_key: { runId, key } },
      create: { runId, key, ...data },
      update: data,
    });
  },

  async listFigures(runId) {
    const rows = await prisma.reportFigure.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toFigure);
  },

  async upsertDataset(dataset) {
    const { runId, key, label, spec, columns, rows } = dataset;
    const data = { label, spec: json(spec), columns: json(columns), rows: json(rows) };
    await prisma.reportDataset.upsert({
      where: { runId_key: { runId, key } },
      create: { runId, key, ...data },
      update: data,
    });
  },

  async listDatasets(runId) {
    const rows = await prisma.reportDataset.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDataset);
  },

  async listBlockDefs() {
    await ensureBuiltinBlocks();
    const rows = await prisma.reportBlockDef.findMany({
      orderBy: [{ createdAt: 'asc' }, { key: 'asc' }, { version: 'asc' }],
    });
    return rows.map(toBlockDef);
  },
};

/**
 * A store that lives in memory, for tests. Its blocks are the built-ins
 * unless given others; `now` sets the clock a new run's createdAt is read from.
 */
export function memoryStore(
  seed: { definitions?: ReportDefinition[]; blockDefs?: BlockDef[]; now?: () => Date } = {}
): ReportStore {
  const definitions = seed.definitions ?? [];
  const now = seed.now ?? (() => new Date());
  const blockDefs = seed.blockDefs ?? builtinBlockDefs();
  const runs = new Map<string, ReportRun>();
  // Counted, not read from the map's size: a deleted run's id is not given out again.
  let created = 0;
  const events: ReportEvent[] = [];
  const queries: ReportQuery[] = [];
  const figures: ReportFigure[] = [];
  const datasets: ReportDataset[] = [];

  // Copies in and out, as a database would: a caller never holds the stored object.
  const copy = <T>(value: T): T => structuredClone(value);
  const requireRun = (id: string) => {
    const run = runs.get(id);
    if (!run) throw new Error(`No report run with id ${id}`);
    return run;
  };

  return {
    async findDefinition(where) {
      const found = definitions.find((d) =>
        'id' in where ? d.id === where.id : d.key === where.key
      );
      return found ? copy(found) : null;
    },

    async listDefinitions() {
      return copy([...definitions].sort((a, b) => a.sortOrder - b.sortOrder));
    },

    async createRun(data) {
      const run: ReportRun = {
        ...copy(data),
        trigger: data.trigger ?? 'manual',
        id: `run${++created}`,
        status: 'QUEUED',
        statusReason: null,
        blocks: [],
        warnings: [],
        usage: null,
        stepCount: 0,
        redactedEmailCount: 0,
        cancelRequested: false,
        timeZone: null,
        currencyCode: null,
        startedAt: null,
        completedAt: null,
        createdAt: now(),
      };
      runs.set(run.id, run);
      return copy(run);
    },

    async getRun(id) {
      const run = runs.get(id);
      return run ? copy(run) : null;
    },

    async findActiveRun() {
      const run = [...runs.values()].find((r) => ACTIVE_STATUSES.includes(r.status));
      return run ? copy(run) : null;
    },

    async updateRun(id, patch) {
      const run = Object.assign(requireRun(id), copy(patch));
      return copy(run);
    },

    async listRuns() {
      return copy([...runs.values()].reverse());
    },

    async listRunsSince(since) {
      return copy([...runs.values()].reverse().filter((run) => run.createdAt >= since));
    },

    async deleteRun(id) {
      requireRun(id);
      runs.delete(id);
      for (const list of [events, queries, figures, datasets] as { runId: string }[][]) {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].runId === id) list.splice(i, 1);
      }
    },

    async appendEvent(runId, type, message, data) {
      const event: ReportEvent = {
        runId,
        seq: events.filter((e) => e.runId === runId).length + 1,
        type,
        message,
        data: data === undefined ? null : copy(data),
        createdAt: new Date(),
      };
      events.push(event);
      return copy(event);
    },

    async listEvents(runId, after = 0) {
      return copy(events.filter((e) => e.runId === runId && e.seq > after));
    },

    async saveQuery(runId, query) {
      const saved: ReportQuery = {
        ...copy(query),
        runId,
        key: `q${queries.filter((q) => q.runId === runId).length + 1}`,
        recheck: null,
      };
      queries.push(saved);
      return copy(saved);
    },

    async getQuery(runId, key) {
      const found = queries.find((q) => q.runId === runId && q.key === key);
      return found ? copy(found) : null;
    },

    async updateQuery(runId, key, patch) {
      const found = queries.find((q) => q.runId === runId && q.key === key);
      if (!found) throw new Error(`No query ${key} on run ${runId}`);
      Object.assign(found, copy(patch));
    },

    async listQueries(runId) {
      return copy(queries.filter((q) => q.runId === runId));
    },

    async upsertFigure(figure) {
      const index = figures.findIndex((f) => f.runId === figure.runId && f.key === figure.key);
      if (index === -1) figures.push(copy(figure));
      else figures[index] = copy(figure);
    },

    async listFigures(runId) {
      return copy(figures.filter((f) => f.runId === runId));
    },

    async upsertDataset(dataset) {
      const index = datasets.findIndex((d) => d.runId === dataset.runId && d.key === dataset.key);
      if (index === -1) datasets.push(copy(dataset));
      else datasets[index] = copy(dataset);
    },

    async listDatasets(runId) {
      return copy(datasets.filter((d) => d.runId === runId));
    },

    async listBlockDefs() {
      return copy(blockDefs);
    },
  };
}
