import { formatFigure } from '../ledger';
import type { Ledger } from '../blocks/types';
import type { ReportDataset, ReportFigure, Unit } from '../types';

/** A small invented ledger for the block tests. */

export const figure = (
  key: string,
  value: number | null,
  unit: Unit,
  extra: Partial<ReportFigure> = {}
): ReportFigure => ({
  runId: 'run1',
  key,
  label: key.replace(/_/g, ' '),
  unit,
  value,
  text: null,
  display: formatFigure(value, unit, 'CAD'),
  source: { kind: 'stated', value: value ?? 0, reason: 'test' },
  queryKeys: [],
  recheckStatus: 'matched',
  previousValue: null,
  ...extra,
});

export const DAILY: ReportDataset = {
  runId: 'run1',
  key: 'daily',
  label: 'Revenue each day',
  spec: { from: 'q1', select: [{ column: 'date' }] },
  columns: [
    { key: 'date', format: 'text' },
    { key: 'revenue', format: 'currency' },
    { key: 'gifts', format: 'count' },
  ],
  rows: [
    ['20261123', 1200.5, 14],
    ['20261124', 3400, 31],
    ['20261125', 800, 9],
  ],
};

export const CHANNELS: ReportDataset = {
  runId: 'run1',
  key: 'channels',
  label: 'Revenue by channel',
  spec: { from: 'q2', select: [{ column: 'channel' }], totalRow: true },
  columns: [
    { key: 'channel', format: 'text' },
    { key: 'revenue', format: 'currency' },
    { key: 'change', format: 'percent' },
  ],
  rows: [
    ['Email', 4000, 0.25],
    ['Direct', 1400.5, -0.031],
    ['Total', 5400.5, null],
  ],
};

export const LEDGER: Ledger = {
  figures: [
    figure('revenue', 5400.5, 'currency'),
    figure('gifts', 54, 'count'),
    figure('change', -0.3712, 'percent'),
    figure('sessions', 1_812_440, 'count'),
    figure('top_channel', null, 'text', { text: 'Email', display: 'Email' }),
  ],
  datasets: [DAILY, CHANNELS],
  currencyCode: 'CAD',
};
