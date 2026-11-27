import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_BLOCKS } from '../blocks/builtin';
import { lintProse, withProseWarnings } from '../blocks/lint';
import type { BlockInstance } from '../blocks/types';
import { figure, LEDGER } from './blocks-fixtures';

const prose = (text: string, extra: Partial<BlockInstance> = {}): BlockInstance => ({
  id: 'b1',
  block: 'prose',
  version: 1,
  data: { paragraphs: [text] },
  ...extra,
});
const typed = (text: string, ledger = LEDGER) =>
  lintProse([prose(text)], ledger).map((warning) => warning.number);

test('lintProse: a number put in with {{fig:key}} is never a warning', () => {
  assert.deepEqual(typed('We raised {{fig:revenue}} from {{ fig: gifts }} gifts.'), []);
});

test('lintProse: a typed number that is a figure as shown is matched', () => {
  assert.deepEqual(typed('We raised $5,401 from 54 gifts.'), []);
  // Text figures match by what they show.
  assert.deepEqual(typed('Most of it came by Email.'), []);
});

test('lintProse: a typed number that is a figure rounded the same way is matched', () => {
  // change is -0.3712: "37%", "37.1%" and "37 percent" are all that figure.
  assert.deepEqual(typed('Revenue fell 37%, or 37.1% to be exact, or 37 percent.'), []);
  // sessions is 1,812,440.
  assert.deepEqual(typed('About 1.8M visits, or 1,812k, or 1,812,440.'), []);
  // revenue is 5400.5.
  assert.deepEqual(typed('Roughly $5.4k, or $5,400.50.'), []);
});

test('lintProse: a typed number the ledger does not hold is a warning', () => {
  assert.deepEqual(typed('Revenue fell 41% to $6,200 from 412 gifts.'), ['41%', '$6,200', '412']);
  // Rounded differently from the figure, it does not match.
  assert.deepEqual(typed('Revenue fell 38%.'), ['38%']);
  assert.deepEqual(typed('About 1.9M visits.'), ['1.9M']);
});

test('lintProse: a warning says where the number is', () => {
  const [warning] = lintProse(
    [
      {
        id: 'b4',
        block: 'priority_cards',
        version: 1,
        data: {
          items: [
            { heading: 'Fine', body: 'Fine too' },
            { heading: 'Down 41%', body: 'x' },
          ],
        },
      },
    ],
    LEDGER
  );
  assert.deepEqual(warning, {
    kind: 'prose',
    blockId: 'b4',
    field: '/items/1/heading',
    number: '41%',
    message:
      '"41%" in block b4 (priority_cards, /items/1/heading) was typed, and no figure in the ledger matches it.',
  });
});

test('lintProse: years, dates, clock times and ordinals are left alone', () => {
  assert.deepEqual(typed('In 2025 and 2026, from 1 to 21 November 2026.'), []);
  assert.deepEqual(typed('On 22 November, on December 31, and on Nov 15.'), []);
  assert.deepEqual(typed('From 15–31 December and 2 to 22 November 2025.'), []);
  assert.deepEqual(typed('Between 2am and 11pm, at 14:30, on the 22nd and the 31st.'), []);
  assert.deepEqual(typed('On 2026-11-15 and 24/11/2026.'), []);
  // A big number beside a month is not a day of the month.
  assert.deepEqual(typed('We had 412 November gifts.'), ['412']);
});

test('lintProse: counts under ten and lengths of time are left alone', () => {
  assert.deepEqual(typed('Five findings, 3 of them urgent, in 4 sections.'), []);
  assert.deepEqual(typed('Over the last 90 days, 12 months and 47-day campaign.'), []);
  // Under ten is only a count when it is a bare whole number.
  assert.deepEqual(typed('A 7% rise worth $5.'), ['7%', '$5']);
});

test('lintProse: codes and names with digits are not numbers', () => {
  assert.deepEqual(typed('Query q12 from GA4 and utm_2026 on page P404x.'), []);
  assert.deepEqual(typed('Version 1.2.3 of the tag.'), []);
});

test('lintProse: a hidden block is skipped', () => {
  assert.deepEqual(lintProse([prose('Up 41%.', { hidden: true })], LEDGER), []);
});

test('lintProse: edited wording is what gets checked', () => {
  const edited = prose('We raised {{fig:revenue}}.', {
    textOverrides: { '/paragraphs/0': 'We raised $9,999.' },
  });
  assert.deepEqual(
    lintProse([edited], LEDGER).map((warning) => warning.number),
    ['$9,999']
  );
});

test('lintProse: with the blocks’ shapes, only wording is read, never a column name or a date key', () => {
  const chart: BlockInstance = {
    id: 'b2',
    block: 'bar_chart',
    version: 1,
    data: {
      title: 'Revenue each day, up 41%',
      series: { dataset: 'daily' },
      x: 'date',
      xKind: 'date',
      value: { column: 'revenue_2026', label: 'Revenue' },
      highlights: [{ x: '20261201', label: 'Giving Tuesday' }],
    },
  };
  // Without the shapes, the date key reads as a number.
  assert.deepEqual(
    lintProse([chart], LEDGER).map((warning) => warning.number),
    ['41%', '20261201']
  );
  const warnings = lintProse([chart], LEDGER, BUILTIN_BLOCKS);
  assert.deepEqual(
    warnings.map((warning) => [warning.field, warning.number]),
    [['/title', '41%']]
  );
});

test('lintProse: nothing to check against means every typed number is a warning', () => {
  const empty = { figures: [], datasets: [], currencyCode: null };
  assert.deepEqual(typed('We raised $5,401.', empty), ['$5,401']);
  // A figure with no value never matches a number.
  const blank = { ...empty, figures: [figure('lost', null, 'count')] };
  assert.deepEqual(typed('We raised 54.', blank), ['54']);
});

test('withProseWarnings: replaces the prose warnings and keeps the rest', () => {
  const recheck = { kind: 'recheck', message: 'q2 could not be run again' };
  const old = { kind: 'prose', message: 'old' };
  const next = lintProse([prose('Up 41%.')], LEDGER);
  assert.deepEqual(withProseWarnings([recheck, old], next), [recheck, ...next]);
  assert.deepEqual(withProseWarnings([recheck, old], []), [recheck]);
});
