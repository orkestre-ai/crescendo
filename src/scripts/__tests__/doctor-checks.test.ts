import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

/**
 * Run doctor and return its combined stdout+stderr.
 * Doctor may exit non-zero (depending on local env) — we always capture output.
 */
function runDoctor(envOverrides: Record<string, string> = {}): string {
  try {
    return execFileSync('npx', ['tsx', 'src/scripts/doctor.ts'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...envOverrides },
      timeout: 60_000,
    }).toString();
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
  }
}

test('doctor output never contains the Anthropic key value (sk-ant-...)', () => {
  const fakeKey = 'sk-ant-test-fake-value-must-never-appear';
  const output = runDoctor({ ANTHROPIC_API_KEY: fakeKey });
  assert.ok(
    !output.includes(fakeKey),
    `Anthropic key value leaked into doctor output:\n${output}`
  );
});

test('doctor output never contains a GA4 service-account-key JSON substring', () => {
  const fakeKey = JSON.stringify({
    type: 'service_account',
    private_key: 'FAKE_PRIVATE_KEY_TOKEN_FROM_TEST',
    client_email: 'fake@fake.iam.gserviceaccount.com',
  });
  const output = runDoctor({
    GA4_SERVICE_ACCOUNT_KEY: fakeKey,
    GA4_PROPERTY_ID: 'properties/1234567890',
  });
  assert.ok(
    !output.includes('FAKE_PRIVATE_KEY_TOKEN_FROM_TEST'),
    `GA4 private-key token leaked into doctor output:\n${output}`
  );
});

test('doctor output never contains EN token value', () => {
  const fakeToken = 'EN_TOKEN_FAKE_VALUE_SHOULD_NEVER_LEAK';
  const output = runDoctor({ EN_API_TOKEN: fakeToken });
  assert.ok(
    !output.includes(fakeToken),
    `EN token value leaked into doctor output:\n${output}`
  );
});

test('doctor output does not contain the Prisma deprecation warning on green', () => {
  // Conditional assertion: if Prisma schema is reported as in-sync (green),
  // the deprecation warning must NOT leak. When schema is not in sync, this
  // test is a no-op.
  const output = runDoctor();
  if (output.includes('Prisma schema') && output.includes('in sync')) {
    assert.ok(
      !output.includes('is deprecated'),
      `Prisma deprecation warning leaked on green verdict:\n${output}`
    );
  }
});

test('doctor prints three tier headers and a banner', () => {
  const output = runDoctor();
  assert.match(output, /Crescendo doctor/, 'banner line missing');
  assert.match(output, /━━ System ━━/, 'System tier header missing');
  assert.match(output, /━━ Runtime ━━/, 'Runtime tier header missing');
  assert.match(output, /━━ Credentials ━━/, 'Credentials tier header missing');
});
