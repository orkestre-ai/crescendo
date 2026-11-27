import type { ReportWarning } from '../types';
import { FIGURE_TOKEN, textFields } from './resolve';
import type { BlockInstance, BlockSeed, JSONSchema, Ledger, ProseWarning } from './types';

/**
 * The prose lint. Numbers in a tile, a table or a chart can only come from
 * the ledger. Wording is free text, so a number can still be typed into it.
 * This finds those numbers and checks each against the ledger; one that
 * matches no figure becomes a warning on the run. It never fails a run.
 */

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
// "22 November", and the first number of "1 to 21 November" or "15–31 December".
const DATE_AFTER = new RegExp(
  `^(?:\\s*(?:to|and|through|until|[–—-])\\s*\\d{1,2})?(?:st|nd|rd|th)?\\s+${MONTH}\\b`,
  'i'
);
// "November 22"
const DATE_BEFORE = new RegExp(`\\b${MONTH}\\.?\\s+$`, 'i');
// "90 days", "the last 12 months": a length of time, not a result.
const DURATION_AFTER = /^\s*-?(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i;
const PERCENT_WORD = /^\s*(?:percent|per cent)\b/i;

const NUMBER = /([$€£])?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?%|bn\b|[kKmM]\b)?/g;

interface Typed {
  text: string;
  value: number;
  decimals: number;
  multiplier: number;
  percent: boolean;
}

/** The numbers typed into a text, leaving out what is not a result. */
function typedNumbers(text: string): Typed[] {
  const found: Typed[] = [];
  // {{fig:key}} is the ledger's own number: take the tokens out first.
  const plain = text.replace(FIGURE_TOKEN, ' ');

  for (const match of plain.matchAll(NUMBER)) {
    const [whole, symbol, digits, fraction, suffix] = match;
    const start = match.index;
    const before = plain.slice(0, start);
    const after = plain.slice(start + whole.length);
    const previous = before.slice(-1);
    const next = after.charAt(0);

    // Part of a word or a code: q3, GA4, utm_2, 2am, 22nd, 90days.
    if (/[\w]/.test(previous) || /[A-Za-z_]/.test(next)) continue;
    // Part of a clock time, a date or a version: 14:30, 2026-11-15, 24/11/2026, 1.2.3.
    if (/[:/]/.test(previous) || /^[:/]\d/.test(after)) continue;
    if (/\d[-.]$/.test(before) || /^[-.]\d/.test(after)) continue;

    const plainInteger = !symbol && !fraction && !suffix && !digits.includes(',');
    const value = Number(digits.replace(/,/g, '') + (fraction ?? ''));
    const percent = !!suffix?.includes('%') || PERCENT_WORD.test(after);

    if (plainInteger && !percent) {
      // A count under ten
      if (value < 10) continue;
      // A year
      if (digits.length === 4 && value >= 1900 && value <= 2100) continue;
      // A day of the month, or a length of time
      if (value <= 31 && (DATE_AFTER.test(after) || DATE_BEFORE.test(before))) continue;
      if (DURATION_AFTER.test(after)) continue;
    }

    const unit = suffix?.trim().toLowerCase();
    found.push({
      text: whole.trim(),
      value,
      decimals: fraction ? fraction.length - 1 : 0,
      multiplier: unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : unit === 'bn' ? 1e9 : 1,
      percent,
    });
  }
  return found;
}

const squash = (text: string) => text.replace(/[\s,]/g, '').toLowerCase();

/** True when a typed number is a figure as shown, or the figure rounded the same way. */
function inLedger(typed: Typed, ledger: Ledger): boolean {
  const places = Math.pow(10, typed.decimals);
  const same = (candidate: number) =>
    Math.round((Math.abs(candidate) / typed.multiplier) * places) / places === typed.value;

  return ledger.figures.some((figure) => {
    if (squash(figure.display) === squash(typed.text)) return true;
    if (figure.value === null) return false;
    // A percent is stored as a fraction: 0.37 is written 37%.
    if (typed.percent) return same(figure.value * 100);
    return same(figure.value) || (figure.unit === 'percent' && same(figure.value * 100));
  });
}

/** The pointers of the text a person may reword, from a block's data shape. */
function editablePaths(schema: JSONSchema, data: unknown, path = ''): Set<string> {
  const out = new Set<string>();
  if (schema.type === 'string' && schema['x-editable'] && typeof data === 'string') out.add(path);
  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    data.forEach((item, i) => {
      for (const found of editablePaths(schema.items!, item, `${path}/${i}`)) out.add(found);
    });
  }
  if (schema.type === 'object' && schema.properties && data && typeof data === 'object') {
    for (const [name, child] of Object.entries(schema.properties)) {
      const value = (data as Record<string, unknown>)[name];
      for (const found of editablePaths(child, value, `${path}/${name}`)) out.add(found);
    }
  }
  return out;
}

/**
 * Find the numbers typed into the wording of a report that the ledger does
 * not hold. Years, dates, clock times, ordinals, lengths of time and counts
 * under ten are left alone. With `defs`, only the text a block marks as
 * wording ("x-editable") is read, so a column name or a date key is never
 * mistaken for a number; without, every text field is.
 */
export function lintProse(
  blocks: BlockInstance[],
  ledger: Ledger,
  defs?: Pick<BlockSeed, 'key' | 'dataSchema'>[]
): ProseWarning[] {
  const warnings: ProseWarning[] = [];
  for (const block of blocks) {
    if (block.hidden) continue;
    const def = defs?.find((d) => d.key === block.block);
    const wording = def ? editablePaths(def.dataSchema, block.data) : null;

    for (const field of textFields(block.data)) {
      if (wording && !wording.has(field.path)) continue;
      const text = block.textOverrides?.[field.path] ?? field.text;
      for (const typed of typedNumbers(text)) {
        if (inLedger(typed, ledger)) continue;
        warnings.push({
          kind: 'prose',
          blockId: block.id,
          field: field.path,
          number: typed.text,
          message: `"${typed.text}" in block ${block.id} (${block.block}, ${field.path}) was typed, and no figure in the ledger matches it.`,
        });
      }
    }
  }
  return warnings;
}

/** A run's warnings with its prose warnings replaced; warnings of other kinds are kept. */
export function withProseWarnings(
  existing: ReportWarning[],
  prose: ProseWarning[]
): ReportWarning[] {
  return [...existing.filter((warning) => warning.kind !== 'prose'), ...prose];
}
