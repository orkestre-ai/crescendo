/**
 * Test runtime gateway detection on all live EN pages.
 *
 * Uses Playwright to scrape each page and extract gateway variables
 * at runtime via page.evaluate(), then classifies each page.
 *
 * Usage:
 *   npx tsx src/scripts/test-live-gateway-detection.ts
 *   npx tsx src/scripts/test-live-gateway-detection.ts --limit 5
 *   npx tsx src/scripts/test-live-gateway-detection.ts --concurrency 3
 */
import { PrismaClient } from '@prisma/client';
import { scrapeWithBrowser, closeBrowser } from '@/lib/playwright-scraper';
import { extractGatewayInfo } from '@/lib/gateway-detection';
import { getScrapableUrl } from '@/lib/url-utils';

const prisma = new PrismaClient();

interface PageResult {
  enPageId: string;
  name: string;
  url: string;
  detectionState: string;
  primaryGateway: string;
  gatewayTypes: string[];
  runtimeSource: boolean;
  elapsedMs: number;
  error?: string;
}

async function main() {
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : undefined;
  const concIdx = process.argv.indexOf('--concurrency');
  const concurrency = concIdx !== -1 ? parseInt(process.argv[concIdx + 1], 10) : 5;

  // Fetch all live, active pages
  const pages = await prisma.fundraisingPage.findMany({
    where: {
      status: 'ACTIVE',
      campaignStatus: 'live',
    },
    select: {
      enPageId: true,
      name: true,
      url: true,
    },
    orderBy: { enPageId: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`\nLive Gateway Detection Test`);
  console.log(`Pages: ${pages.length} | Concurrency: ${concurrency}`);
  console.log('='.repeat(80));

  const results: PageResult[] = [];
  const queue = [...pages];

  // Process in batches
  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(
      batch.map(async (page) => {
        const url = getScrapableUrl(page);
        const start = Date.now();
        try {
          const { html, runtimeGateway } = await scrapeWithBrowser(url, {
            timeoutMs: 45000,
          });
          const info = extractGatewayInfo(html, runtimeGateway);
          const elapsed = Date.now() - start;

          const result: PageResult = {
            enPageId: page.enPageId,
            name: page.name.substring(0, 40),
            url,
            detectionState: info.detectionState,
            primaryGateway: info.primaryGateway,
            gatewayTypes: info.gatewayTypes,
            runtimeSource: runtimeGateway !== null,
            elapsedMs: elapsed,
          };

          // Live progress
          const icon =
            info.detectionState === 'gateway-found'
              ? 'FOUND'
              : info.detectionState === 'vgs-only'
                ? 'VGS  '
                : 'INCON';
          console.log(
            `  [${icon}] ${page.enPageId.padEnd(8)} ${result.name.padEnd(42)} ${info.primaryGateway.padEnd(14)} runtime=${runtimeGateway !== null} (${elapsed}ms)`
          );

          return result;
        } catch (err: any) {
          const elapsed = Date.now() - start;
          console.log(
            `  [ERROR] ${page.enPageId.padEnd(8)} ${page.name.substring(0, 40).padEnd(42)} ${err.message?.substring(0, 30)} (${elapsed}ms)`
          );
          return {
            enPageId: page.enPageId,
            name: page.name.substring(0, 40),
            url,
            detectionState: 'error' as string,
            primaryGateway: 'error',
            gatewayTypes: [],
            runtimeSource: false,
            elapsedMs: elapsed,
            error: err.message,
          };
        }
      })
    );
    results.push(...batchResults);

    // Brief delay between batches to be respectful to EN servers
    if (queue.length > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const counts = {
    'gateway-found': 0,
    'vgs-only': 0,
    inconclusive: 0,
    error: 0,
  };
  for (const r of results) {
    counts[r.detectionState as keyof typeof counts] =
      (counts[r.detectionState as keyof typeof counts] || 0) + 1;
  }

  console.log(`  gateway-found: ${counts['gateway-found']}`);
  console.log(`  vgs-only:      ${counts['vgs-only']}`);
  console.log(`  inconclusive:  ${counts['inconclusive']}`);
  console.log(`  error:         ${counts['error']}`);
  console.log(`  total:         ${results.length}`);

  const runtimeCount = results.filter((r) => r.runtimeSource).length;
  console.log(`\n  Runtime gateway extracted: ${runtimeCount}/${results.length}`);

  const avgMs = Math.round(results.reduce((s, r) => s + r.elapsedMs, 0) / results.length);
  console.log(`  Avg scrape time: ${avgMs}ms`);

  // List inconclusives
  const inconclusives = results.filter((r) => r.detectionState === 'inconclusive');
  if (inconclusives.length > 0) {
    console.log(`\n  Still inconclusive (${inconclusives.length}):`);
    for (const r of inconclusives) {
      console.log(`    ${r.enPageId} - ${r.name}`);
    }
  }

  // List errors
  const errors = results.filter((r) => r.detectionState === 'error');
  if (errors.length > 0) {
    console.log(`\n  Errors (${errors.length}):`);
    for (const r of errors) {
      console.log(`    ${r.enPageId} - ${r.error?.substring(0, 60)}`);
    }
  }

  console.log('');
}

main()
  .catch((err) => {
    console.error('Script error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser();
    await prisma.$disconnect();
  });
