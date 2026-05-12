/**
 * Validation script for gateway detection library.
 *
 * Runs extractPaymentGateways(), classifyDetection(), and extractGatewayInfo()
 * from src/lib/gateway-detection.ts against HTML fixture files to confirm
 * DEMO mode includes gateway data and structured extraction works correctly.
 *
 * Usage: npx tsx src/scripts/test-gateway-detection.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  extractPaymentGateways,
  classifyDetection,
  extractGatewayInfo,
} from '@/lib/gateway-detection';

// ---------------------------------------------------------------------------
// Fixture test cases
// ---------------------------------------------------------------------------

const FIXTURES = [
  {
    file: 'page-179896-stripe-demo.html',
    expected: 'gateway-found',
    label: 'Stripe page (179896)',
  },
  {
    file: 'page-165528-vgs-demo.html',
    expected: 'vgs-only',
    label: 'VGS-only page (165528)',
  },
  {
    file: 'page-102519-vgs-sandbox.html',
    expected: 'vgs-only',
    label: 'VGS sandbox page (102519)',
  },
  {
    file: 'cloudflare-challenge.html',
    expected: 'inconclusive',
    label: 'Cloudflare block',
  },
];

const FIXTURE_DIR = path.resolve(__dirname, '..', 'test-fixtures');

/** Sensitive data patterns that must NEVER appear in extractGatewayInfo output */
const SENSITIVE_PATTERNS = [
  'pk_live',
  'pk_test',
  'acct_',
  'ROUTE_ID',
  'VAULT_ID',
  'routeId',
  'vaultId',
];

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): boolean {
  if (condition) {
    console.log(`  PASS: ${message}`);
    return true;
  } else {
    console.log(`  FAIL: ${message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Gateway Detection Validation');
  console.log('='.repeat(60));
  console.log(`Fixture directory: ${FIXTURE_DIR}\n`);

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  // =========================================================================
  // SECTION 1: classifyDetection() tests (Phase 1 — preserved)
  // =========================================================================

  console.log('--- Section 1: classifyDetection() ---\n');

  for (const { file, expected, label } of FIXTURES) {
    const filePath = path.join(FIXTURE_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.log(`SKIP: ${label} -- fixture not found: ${file}`);
      skipCount++;
      continue;
    }

    const html = fs.readFileSync(filePath, 'utf-8');
    const result = classifyDetection(html);

    const passed = result.state === expected;
    const icon = passed ? 'PASS' : 'FAIL';
    console.log(`${icon}: ${label} => ${result.state}`);

    if (!passed) {
      console.log(`  Expected: ${expected}, Got: ${result.state}`);
      failCount++;
    } else {
      passCount++;
    }

    // Print detection details
    if (result.state === 'gateway-found') {
      console.log(`  Gateway type: ${result.gatewayType}`);
      console.log(`  Gateways count: ${result.gateways.length}`);
    } else if (result.state === 'vgs-only') {
      console.log(`  Vault present: true`);
      const vaultObj = result.vault as Record<string, unknown>;
      if (vaultObj && typeof vaultObj.environment === 'string') {
        console.log(`  Vault environment: ${vaultObj.environment}`);
      }
    } else if (result.state === 'inconclusive') {
      console.log(`  Reason: ${result.reason}`);
    }

    console.log('');
  }

  // Raw extraction test (Phase 1 — preserved)
  console.log('-'.repeat(60));
  console.log('Raw extraction on Stripe fixture (page 179896):');
  const stripeFixturePath = path.join(FIXTURE_DIR, 'page-179896-stripe-demo.html');
  if (fs.existsSync(stripeFixturePath)) {
    const stripeHtml = fs.readFileSync(stripeFixturePath, 'utf-8');
    const rawResult = extractPaymentGateways(stripeHtml);
    console.log(`  detected: ${rawResult.detected}`);
    console.log(
      `  gateways: ${rawResult.gateways ? `array with ${rawResult.gateways.length} entry(s)` : 'null'}`
    );
    console.log(`  vault: ${rawResult.vault ? 'present' : 'null'}`);
    if (rawResult.gateways && rawResult.gateways.length > 0) {
      const first = rawResult.gateways[0] as Record<string, unknown>;
      console.log(
        `  first gateway: type=${first.gateway}, country=${first.country}, currency=${first.currency}`
      );
    }
  } else {
    console.log('  Stripe fixture not found, skipping raw extraction test');
  }

  // =========================================================================
  // SECTION 2: extractGatewayInfo() tests (Phase 2)
  // =========================================================================

  console.log('\n' + '='.repeat(60));
  console.log('--- Section 2: extractGatewayInfo() ---\n');

  // Test Stripe fixture
  const stripeHtml2 = fs.existsSync(stripeFixturePath)
    ? fs.readFileSync(stripeFixturePath, 'utf-8')
    : null;

  if (stripeHtml2) {
    console.log('Stripe page (179896):');
    const info = extractGatewayInfo(stripeHtml2);

    if (assert(info.detectionState === 'gateway-found', 'detectionState is gateway-found'))
      passCount++;
    else failCount++;
    if (assert(info.primaryGateway === 'stripe', 'primaryGateway is stripe')) passCount++;
    else failCount++;
    if (assert(info.gatewayTypes.includes('stripe'), 'gatewayTypes includes stripe')) passCount++;
    else failCount++;
    if (
      assert(
        info.paymentMethods.length === 3,
        `paymentMethods has 3 entries (${info.paymentMethods.join(', ')})`
      )
    )
      passCount++;
    else failCount++;
    if (assert(info.paymentMethods.includes('visa'), 'paymentMethods includes visa')) passCount++;
    else failCount++;
    if (assert(info.paymentMethods.includes('mastercard'), 'paymentMethods includes mastercard'))
      passCount++;
    else failCount++;
    if (assert(info.paymentMethods.includes('amex'), 'paymentMethods includes amex')) passCount++;
    else failCount++;
    if (assert(info.hasStripeWalletButtons === true, 'hasStripeWalletButtons is true')) passCount++;
    else failCount++;
    if (assert(info.hasVgsCollectFrame === false, 'hasVgsCollectFrame is false')) passCount++;
    else failCount++;
    if (assert(info.vgsEnvironment !== null, `vgsEnvironment is ${info.vgsEnvironment}`))
      passCount++;
    else failCount++;
    if (assert(info.inconclusiveReason === null, 'inconclusiveReason is null')) passCount++;
    else failCount++;
    if (
      assert(
        typeof info.detectedAt === 'string' && info.detectedAt.length > 0,
        'detectedAt is ISO string'
      )
    )
      passCount++;
    else failCount++;
    console.log('');
  } else {
    console.log('SKIP: Stripe fixture not found');
    skipCount++;
  }

  // Test VGS-only fixture (live)
  const vgsFixturePath = path.join(FIXTURE_DIR, 'page-165528-vgs-demo.html');
  const vgsHtml = fs.existsSync(vgsFixturePath) ? fs.readFileSync(vgsFixturePath, 'utf-8') : null;

  if (vgsHtml) {
    console.log('VGS-only page (165528):');
    const info = extractGatewayInfo(vgsHtml);

    if (assert(info.detectionState === 'vgs-only', 'detectionState is vgs-only')) passCount++;
    else failCount++;
    if (assert(info.primaryGateway === 'vgs-only', 'primaryGateway is vgs-only')) passCount++;
    else failCount++;
    if (assert(info.paymentMethods.length === 3, `paymentMethods has 3 entries`)) passCount++;
    else failCount++;
    if (assert(info.hasStripeWalletButtons === false, 'hasStripeWalletButtons is false'))
      passCount++;
    else failCount++;
    if (assert(info.hasVgsCollectFrame === true, 'hasVgsCollectFrame is true')) passCount++;
    else failCount++;
    if (assert(info.vgsEnvironment === 'live', 'vgsEnvironment is live')) passCount++;
    else failCount++;
    if (assert(info.inconclusiveReason === null, 'inconclusiveReason is null')) passCount++;
    else failCount++;
    console.log('');
  } else {
    console.log('SKIP: VGS fixture not found');
    skipCount++;
  }

  // Test VGS sandbox fixture
  const sandboxFixturePath = path.join(FIXTURE_DIR, 'page-102519-vgs-sandbox.html');
  const sandboxHtml = fs.existsSync(sandboxFixturePath)
    ? fs.readFileSync(sandboxFixturePath, 'utf-8')
    : null;

  if (sandboxHtml) {
    console.log('VGS sandbox page (102519):');
    const info = extractGatewayInfo(sandboxHtml);

    if (assert(info.detectionState === 'vgs-only', 'detectionState is vgs-only')) passCount++;
    else failCount++;
    if (assert(info.vgsEnvironment === 'sandbox', 'vgsEnvironment is sandbox')) passCount++;
    else failCount++;
    if (assert(info.hasVgsCollectFrame === true, 'hasVgsCollectFrame is true')) passCount++;
    else failCount++;
    console.log('');
  } else {
    console.log('SKIP: VGS sandbox fixture not found');
    skipCount++;
  }

  // Test Cloudflare fixture
  const cfFixturePath = path.join(FIXTURE_DIR, 'cloudflare-challenge.html');
  const cfHtml = fs.existsSync(cfFixturePath) ? fs.readFileSync(cfFixturePath, 'utf-8') : null;

  if (cfHtml) {
    console.log('Cloudflare block:');
    const info = extractGatewayInfo(cfHtml);

    if (assert(info.detectionState === 'inconclusive', 'detectionState is inconclusive'))
      passCount++;
    else failCount++;
    if (
      assert(
        info.inconclusiveReason !== null && info.inconclusiveReason.includes('Cloudflare'),
        'inconclusiveReason mentions Cloudflare'
      )
    )
      passCount++;
    else failCount++;
    if (assert(info.paymentMethods.length === 0, 'paymentMethods is empty')) passCount++;
    else failCount++;
    if (assert(info.hasStripeWalletButtons === false, 'hasStripeWalletButtons is false'))
      passCount++;
    else failCount++;
    if (assert(info.hasVgsCollectFrame === false, 'hasVgsCollectFrame is false')) passCount++;
    else failCount++;
    console.log('');
  } else {
    console.log('SKIP: Cloudflare fixture not found');
    skipCount++;
  }

  // =========================================================================
  // SECTION 3: Sensitive data check (DATA-04)
  // =========================================================================

  console.log('='.repeat(60));
  console.log('--- Section 3: Sensitive Data Check (DATA-04) ---\n');

  for (const { file, label } of FIXTURES) {
    const filePath = path.join(FIXTURE_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const html = fs.readFileSync(filePath, 'utf-8');
    const info = extractGatewayInfo(html);
    const serialized = JSON.stringify(info);

    let clean = true;
    for (const pattern of SENSITIVE_PATTERNS) {
      if (serialized.includes(pattern)) {
        console.log(`FAIL: ${label} -- output contains sensitive pattern: "${pattern}"`);
        clean = false;
        failCount++;
      }
    }

    if (clean) {
      console.log(`PASS: ${label} -- no sensitive data in output`);
      passCount++;
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);

  if (skipCount === FIXTURES.length) {
    console.log('ERROR: No fixtures found. Nothing was tested.');
    process.exit(1);
  }

  if (failCount > 0) {
    console.log('FAILED: Some tests did not pass.');
    process.exit(1);
  }

  console.log('ALL TESTS PASSED');
  process.exit(0);
}

main();
