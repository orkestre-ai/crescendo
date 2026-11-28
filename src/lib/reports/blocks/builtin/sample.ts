import { formatFigure } from '../../ledger';
import type { Cell, Unit } from '../../types';
import type { ResolvedDataset, ResolvedFigure } from '../types';

/**
 * Helpers for the sample data of the built-in blocks. Every name and number
 * in a sample is invented: it shows the block, not a real organisation.
 */

const CURRENCY = 'CAD';

export function sampleFigure(value: number, unit: Unit, label: string): ResolvedFigure {
  return {
    value,
    display: formatFigure(value, unit, CURRENCY),
    label,
    unit,
    recheckStatus: 'matched',
  };
}

export function sampleTable(
  label: string,
  columns: [key: string, format: Unit][],
  rows: Cell[][],
  totalRow = false
): ResolvedDataset {
  return {
    label,
    columns: columns.map(([key, format]) => ({ key, format })),
    rows,
    totalRow,
  };
}

/** A repeatable stream of numbers between 0 and 1, so samples never change. */
export function sampleNoise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** `count` days from `start` (YYYY-MM-DD), as GA4 writes them: 20261115. */
export function sampleDays(start: string, count: number): string[] {
  const first = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(first + i * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  );
}
