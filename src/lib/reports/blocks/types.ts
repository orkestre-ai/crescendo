import type {
  Cell,
  Column,
  RecheckStatus,
  ReportDataset,
  ReportFigure,
  ReportWarning,
  Unit,
} from '../types';

/**
 * The part of JSON Schema a block's data shape may use, plus two marks of
 * Crescendo's own: "x-ref" for a slot that takes a ledger reference, and
 * "x-editable" for text a person may reword.
 */
export interface JSONSchema {
  type?: 'object' | 'array' | 'string' | 'boolean';
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  enum?: string[];
  'x-ref'?: 'figure' | 'dataset';
  'x-editable'?: boolean;
}

/** A block as data: the shape it accepts, how it is drawn, and an example. */
export interface BlockSeed {
  key: string;
  name: string;
  description: string;
  dataSchema: JSONSchema;
  template: string;
  css: string;
  /**
   * Example data as the template receives it: every figure slot already
   * holds a ResolvedFigure and every dataset slot a ResolvedDataset.
   */
  sampleData: unknown;
}

export type BlockOrigin = 'builtin' | 'builder' | 'imported';
export type BlockStatus = 'approved' | 'unreviewed' | 'disabled';

/** A stored block. A run draws each block with the version it recorded. */
export interface BlockDef extends BlockSeed {
  version: number;
  isCurrent: boolean;
  origin: BlockOrigin;
  status: BlockStatus;
}

/** One block placed in a report. `data` holds references, never numbers. */
export interface BlockInstance {
  id: string;
  block: string;
  version: number;
  data: unknown;
  hidden?: boolean;
  textOverrides?: Record<string, string>;
}

export interface BlockIssue {
  /** The rule that was broken, e.g. "schema-number" or "css-colour". */
  rule: string;
  message: string;
  /** Where in the data or the definition, when that helps. */
  path?: string;
}

/** What a block may read from: the figures and tables Crescendo computed. */
export interface Ledger {
  figures: ReportFigure[];
  datasets: ReportDataset[];
  currencyCode: string | null;
}

/** What a template gets in place of { "figure": "<key>" }. */
export interface ResolvedFigure {
  value: number | null;
  display: string;
  label: string;
  unit: Unit;
  recheckStatus: RecheckStatus;
}

/** What a template gets in place of { "dataset": "<key>" }. */
export interface ResolvedDataset {
  columns: Column[];
  rows: Cell[][];
  label: string;
  /** True when the last row is the total. */
  totalRow: boolean;
}

/** A number typed into the wording that the ledger does not hold. */
export interface ProseWarning extends ReportWarning {
  kind: 'prose';
  blockId: string;
  /** The field the number is in, as a JSON pointer into the block's data. */
  field: string;
  number: string;
}
