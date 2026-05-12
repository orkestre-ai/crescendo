import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rollUpExit,
  checkNodeVersion,
  parseEnvLocal,
  isStale,
  looksPlaceholderValue,
  type Check,
} from '../doctor-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('rollUpExit returns 0 for empty array', () => {
  assert.equal(rollUpExit([]), 0);
});

test('rollUpExit returns 0 for single green', () => {
  assert.equal(rollUpExit([{ name: 'a', verdict: 'green' }]), 0);
});

test('rollUpExit returns 0 when all green', () => {
  const checks: Check[] = [
    { name: 'a', verdict: 'green' },
    { name: 'b', verdict: 'green' },
  ];
  assert.equal(rollUpExit(checks), 0);
});

test('rollUpExit returns 2 when any yellow and no red', () => {
  const checks: Check[] = [
    { name: 'a', verdict: 'green' },
    { name: 'b', verdict: 'yellow' },
  ];
  assert.equal(rollUpExit(checks), 2);
});

test('rollUpExit returns 2 when ONLY yellows (never 0)', () => {
  const checks: Check[] = [
    { name: 'a', verdict: 'yellow' },
    { name: 'b', verdict: 'yellow' },
  ];
  assert.equal(rollUpExit(checks), 2);
});

test('rollUpExit returns 1 when any red (even with yellows and greens)', () => {
  const checks: Check[] = [
    { name: 'a', verdict: 'yellow' },
    { name: 'b', verdict: 'red' },
    { name: 'c', verdict: 'green' },
  ];
  assert.equal(rollUpExit(checks), 1);
});

test('rollUpExit returns 1 for single red', () => {
  assert.equal(rollUpExit([{ name: 'a', verdict: 'red' }]), 1);
});

test('checkNodeVersion 20.0.0 is green', () => {
  const c = checkNodeVersion('20.0.0');
  assert.equal(c.verdict, 'green');
});

test('checkNodeVersion 19.9.9 is red with nvm remediation', () => {
  const c = checkNodeVersion('19.9.9');
  assert.equal(c.verdict, 'red');
  assert.match(c.remediation ?? '', /nvm install 20/);
});

test('checkNodeVersion 22.10.0 is green (>=20 inclusive of higher majors)', () => {
  const c = checkNodeVersion('22.10.0');
  assert.equal(c.verdict, 'green');
});

test('parseEnvLocal: clean fixture has zero placeholders', () => {
  const p = join(__dirname, 'fixtures/env.local.fixture');
  const contents = readFileSync(p, 'utf8');
  assert.equal(parseEnvLocal(contents).placeholders, 0);
});

test('parseEnvLocal: placeholders fixture has at least one placeholder', () => {
  const p = join(__dirname, 'fixtures/env.local.placeholders.fixture');
  const contents = readFileSync(p, 'utf8');
  assert.ok(parseEnvLocal(contents).placeholders >= 1);
});

test('parseEnvLocal: detects =your_key patterns', () => {
  const contents = 'API_KEY=your_secret_key\nOTHER=real_value';
  assert.ok(parseEnvLocal(contents).placeholders >= 1);
});

test('parseEnvLocal: detects =... patterns', () => {
  const contents = 'API_KEY=...\nOTHER=real_value';
  assert.ok(parseEnvLocal(contents).placeholders >= 1);
});

test('looksPlaceholderValue: undefined / empty / whitespace are placeholders', () => {
  assert.equal(looksPlaceholderValue(undefined), true);
  assert.equal(looksPlaceholderValue(null), true);
  assert.equal(looksPlaceholderValue(''), true);
  assert.equal(looksPlaceholderValue('   '), true);
});

test('looksPlaceholderValue: your_* values are placeholders', () => {
  assert.equal(looksPlaceholderValue('your_anthropic_api_key'), true);
  assert.equal(looksPlaceholderValue('"your_engaging_networks_api_token"'), true);
});

test('looksPlaceholderValue: trailing-ellipsis values are placeholders', () => {
  assert.equal(looksPlaceholderValue('sk-ant-api03-...'), true);
  assert.equal(looksPlaceholderValue('...'), true);
  assert.equal(looksPlaceholderValue('"sk-ant-api03-..."'), true);
});

test('looksPlaceholderValue: real-looking credentials are NOT placeholders', () => {
  assert.equal(
    looksPlaceholderValue('sk-ant-api03-AbCdEf1234567890XyZ-real-looking-key'),
    false
  );
  assert.equal(looksPlaceholderValue('properties/123456789'), false);
  assert.equal(looksPlaceholderValue('eyJhbGciOi...QzNDU2Nzg5'), false); // ... in the middle, not trailing
});

test('isStale(null) is true', () => {
  assert.equal(isStale(null), true);
});

test('isStale(8 days ago) is true', () => {
  assert.equal(isStale(new Date(Date.now() - 8 * 86400 * 1000)), true);
});

test('isStale(1 day ago) is false', () => {
  assert.equal(isStale(new Date(Date.now() - 1 * 86400 * 1000)), false);
});
