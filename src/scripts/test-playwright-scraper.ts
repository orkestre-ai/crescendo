/**
 * Test script for Playwright scraper module.
 * Verifies that Playwright can bypass Cloudflare and scrape real EN page content.
 *
 * Usage:
 *   npx tsx src/scripts/test-playwright-scraper.ts
 *   npx tsx src/scripts/test-playwright-scraper.ts --url https://example.com/page
 */
import { scrapeWithBrowser, closeBrowser } from '@/lib/playwright-scraper';

const DEFAULT_URL = 'https://secured.oxfam.ca/page/20905/donate/1?mode=DEMO';

async function main() {
  const urlArg = process.argv.indexOf('--url');
  const url = urlArg !== -1 && process.argv[urlArg + 1] ? process.argv[urlArg + 1] : DEFAULT_URL;

  console.log(`\nScraping: ${url}\n`);

  const start = Date.now();
  const { html, runtimeGateway } = await scrapeWithBrowser(url, { timeoutMs: 45000 });
  const elapsed = Date.now() - start;

  // Checks
  const isCfChallenge = html.includes('_cf_chl_opt');
  const hasEnMarker =
    html.includes('EngagingNetworks') || html.includes('en__') || html.includes('pageJson');

  const hasH1 = /<h1[\s>]/i.test(html);
  const hasMeta = /meta\s+name=["']description["']/i.test(html);
  const hasForm = /<form[\s>]/i.test(html);
  const hasGatewayScript =
    html.includes('paymentGateways') || html.includes('window.EngagingNetworks');

  console.log('--- Results ---');
  console.log(`HTML length:        ${html.length} bytes`);
  console.log(`Elapsed:            ${elapsed}ms`);
  console.log(`CF challenge:       ${isCfChallenge ? 'YES (BAD)' : 'No (good)'}`);
  console.log(`EN markers found:   ${hasEnMarker ? 'Yes' : 'No'}`);
  console.log(`Has <h1>:           ${hasH1 ? 'Yes' : 'No'}`);
  console.log(`Has meta desc:      ${hasMeta ? 'Yes' : 'No'}`);
  console.log(`Has <form>:         ${hasForm ? 'Yes' : 'No'}`);
  console.log(`Has gateway script: ${hasGatewayScript ? 'Yes' : 'No'}`);

  // Runtime gateway extraction results
  console.log('\n--- Runtime Gateway (page.evaluate) ---');
  if (runtimeGateway) {
    console.log(
      `Gateways:           ${runtimeGateway.gateways ? JSON.stringify(runtimeGateway.gateways.map((g: any) => g.gateway || g)) : 'null'}`
    );
    console.log(`Vault:              ${runtimeGateway.vault ? 'present' : 'null'}`);
  } else {
    console.log('Not extracted (window.EngagingNetworks not found)');
  }

  // Pass/fail summary
  const passed = html.length > 10000 && !isCfChallenge && hasEnMarker;

  console.log(
    `\n${passed ? 'PASS' : 'FAIL'}: Playwright scrape ${passed ? 'succeeded' : 'did not return expected content'}\n`
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Script error:', err);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser());
