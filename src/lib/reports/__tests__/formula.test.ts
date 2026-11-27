import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DivisionByZeroError, evaluateFormula, FormulaError, parseFormula } from '../formula';

test('evaluateFormula: multiplication and division bind tighter than plus and minus', () => {
  assert.equal(evaluateFormula('2 + 3 * 4', {}), 14);
  assert.equal(evaluateFormula('20 - 12 / 4', {}), 17);
});

test('evaluateFormula: operators of the same rank go left to right', () => {
  assert.equal(evaluateFormula('100 / 10 / 5', {}), 2);
  assert.equal(evaluateFormula('10 - 4 - 3', {}), 3);
});

test('evaluateFormula: parentheses change the order', () => {
  assert.equal(evaluateFormula('(2 + 3) * 4', {}), 20);
  assert.equal(evaluateFormula('((1 + 2) * (3 + 4)) / 7', {}), 3);
});

test('evaluateFormula: names read their values', () => {
  assert.equal(evaluateFormula('revenue / sessions', { revenue: 1500, sessions: 300 }), 5);
  assert.equal(
    evaluateFormula('(this_year - last_year) / last_year', { this_year: 120, last_year: 100 }),
    0.2
  );
});

test('evaluateFormula: decimals and a leading minus', () => {
  assert.equal(evaluateFormula('0.5 * 4', {}), 2);
  assert.equal(evaluateFormula('.25 * 4', {}), 1);
  assert.equal(evaluateFormula('-a + 10', { a: 4 }), 6);
  assert.equal(evaluateFormula('3 * -(a - 1)', { a: 3 }), -6);
});

test('evaluateFormula: nothing is rounded', () => {
  assert.equal(evaluateFormula('a / b', { a: 1, b: 3 }), 1 / 3);
});

test('evaluateFormula: division by zero throws', () => {
  assert.throws(() => evaluateFormula('a / b', { a: 1, b: 0 }), DivisionByZeroError);
  assert.throws(() => evaluateFormula('1 / (2 - 2)', {}), /divides by zero/);
});

test('evaluateFormula: a name with no value throws', () => {
  assert.throws(() => evaluateFormula('a + missing', { a: 1 }), /"missing", which has no value/);
});

test('evaluateFormula: an inherited property is not a value', () => {
  assert.throws(() => evaluateFormula('toString', {}), FormulaError);
  assert.throws(() => evaluateFormula('constructor', {}), FormulaError);
});

test('evaluateFormula: anything that is not arithmetic is refused', () => {
  const refused = [
    'a ** 2',
    'a % 2',
    'a > 1',
    'a == 1',
    'Math.max(1, 2)',
    'sum(a)',
    'process.exit(1)',
    'a; b',
    'a ? 1 : 2',
    '"text"',
    '`x`',
    'a[0]',
    '1e3',
    '1,000',
    '$5',
    'a = 1',
  ];
  for (const expr of refused) {
    assert.throws(() => evaluateFormula(expr, { a: 1, b: 2 }), FormulaError, expr);
  }
});

test('evaluateFormula: broken formulas are refused', () => {
  for (const expr of [
    '',
    '   ',
    '1 +',
    '* 2',
    '(1 + 2',
    '1 + 2)',
    '1 2',
    'a b',
    '()',
    '1 + + 2 *',
  ]) {
    assert.throws(() => evaluateFormula(expr, { a: 1, b: 2 }), FormulaError, JSON.stringify(expr));
  }
});

test('parseFormula: a syntax error is found without any values', () => {
  assert.throws(() => parseFormula('revenue /'), FormulaError);
  assert.doesNotThrow(() => parseFormula('revenue / sessions'));
});
