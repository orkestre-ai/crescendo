/**
 * The shapes of a report run and its ledger. These are plain types, not the
 * Prisma ones, so the in-memory store and the tests need no database.
 */

import type { ReportInputField } from './definitions/inputs';

export type ReportRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'RECHECKING'
  | 'COMPLETED'
  | 'NEEDS_ATTENTION'
  | 'STOPPED'
  | 'CANCELLED'
  | 'FAILED';

/** A run in one of these states blocks a new one from starting. */
export const ACTIVE_STATUSES: ReportRunStatus[] = ['QUEUED', 'RUNNING', 'RECHECKING'];

export type Unit = 'currency' | 'count' | 'percent' | 'ratio' | 'text';
export const UNITS = ['currency', 'count', 'percent', 'ratio', 'text'] as const;

export type RecheckStatus = 'unchecked' | 'matched' | 'corrected' | 'stated';

export interface RowMatch {
  column: string;
  op: '=' | '!=' | 'contains' | 'in' | '>=' | '<=';
  value: string | string[];
}

export type FigureSource =
  | { kind: 'cell'; query: string; column: string; where: RowMatch[] }
  | {
      kind: 'aggregate';
      query: string;
      column: string;
      agg: 'sum' | 'avg' | 'min' | 'max' | 'count';
      where?: RowMatch[];
    }
  | { kind: 'formula'; expr: string; refs: Record<string, string> }
  | { kind: 'stated'; value: number | string; reason: string };

export interface DatasetSpec {
  from: string;
  select: { column: string; as?: string; format?: Unit }[];
  where?: RowMatch[];
  join?: {
    query: string;
    on: string;
    where?: RowMatch[];
    select: { column: string; as: string; format?: Unit }[];
  }[];
  computed?: { as: string; expr: string; format?: Unit }[];
  sort?: { column: string; desc?: boolean }[];
  limit?: number;
  cumulative?: string[];
  totalRow?: boolean;
}

export interface Column {
  key: string;
  format: Unit;
}

export type Cell = number | string | null;

/** The part of a definition a run keeps, so later edits never change it. */
export interface DefinitionSnapshot {
  key: string;
  name: string;
  prompt: string;
  enabledTools: string[];
  maxSteps: number;
  maxMinutes: number;
}

export interface ReportDefinition extends DefinitionSnapshot {
  id: string;
  description: string;
  inputs: ReportInputField[];
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  /** "HH:MM" in America/Toronto: the schedule starts it once a day after this time. */
  scheduleDailyAt: string | null;
}

/** Who started a run: a person, or the daily schedule. */
export type ReportTrigger = 'manual' | 'schedule';

/** Tokens only: there is no price table. */
export interface ReportUsage {
  /** Input tokens that were not read from the prompt cache. */
  inputTokens: number;
  /** Input tokens read from the prompt cache. */
  cachedInputTokens: number;
  outputTokens: number;
  steps: number;
}

/**
 * Something a reader of the report should know. `kind` says where it came
 * from, so other checks can add their own beside the recheck's.
 */
export interface ReportWarning {
  kind: string;
  message: string;
}

export interface ReportRun {
  id: string;
  definitionId: string | null;
  definitionSnapshot: DefinitionSnapshot;
  status: ReportRunStatus;
  statusReason: string | null;
  title: string;
  preparedBy: string | null;
  trigger: ReportTrigger;
  inputs: Record<string, string>;
  blocks: unknown[];
  warnings: ReportWarning[];
  usage: ReportUsage | null;
  stepCount: number;
  redactedEmailCount: number;
  cancelRequested: boolean;
  timeZone: string | null;
  currencyCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

/** How the second run of a query compared with the first. */
export interface QueryRecheck {
  checkedAt: string;
  matched: boolean;
  rowsBefore: number;
  rowsAfter: number;
  /** Rows only in the first run, and rows only in the second; 20 of each at most. */
  removed: unknown[];
  added: unknown[];
  /** Set when the query could not be run again; its figures stay unchecked. */
  error?: string;
}

export interface ReportQuery {
  runId: string;
  key: string;
  tool: string;
  params: unknown;
  result: unknown;
  rowCount: number;
  sampled: boolean;
  samplingNote: string | null;
  recheck: QueryRecheck | null;
}

export interface ReportFigure {
  runId: string;
  key: string;
  label: string;
  unit: Unit;
  value: number | null;
  text: string | null;
  display: string;
  source: FigureSource;
  queryKeys: string[];
  recheckStatus: RecheckStatus;
  previousValue: number | null;
}

export interface ReportDataset {
  runId: string;
  key: string;
  label: string;
  spec: DatasetSpec;
  columns: Column[];
  rows: Cell[][];
}

export type ReportEventType =
  | 'status'
  | 'query'
  | 'figure'
  | 'dataset'
  | 'tool'
  | 'tool_error'
  | 'note'
  | 'summary'
  | 'warning';

export interface ReportEvent {
  runId: string;
  seq: number;
  type: ReportEventType;
  message: string;
  data: unknown;
  createdAt: Date;
}
