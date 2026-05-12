/**
 * Test the ACTUAL improved scraper from src/lib/scraper.ts
 * This uses the real scraper with all enhancements
 */

import { PrismaClient } from '@prisma/client';
import { scraper } from '../lib/scraper';
import { getScrapableUrl } from '../lib/url-utils';

const prisma = new PrismaClient();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function main() {
  console.log(colors.bright + '\n🧪 Testing Improved Scraper\n' + colors.reset);

  // Test first 3 active pages
  const pages = await prisma.fundraisingPage.findMany({
    where: { status: 'ACTIVE' },
    take: 5,
    orderBy: { enPageId: 'asc' },
  });

  console.log(`${colors.blue}Testing ${pages.length} pages...${colors.reset}\n`);

  const results = { h1: 0, meta: 0, cta: 0, amounts: 0, total: 0 };

  for (const page of pages) {
    const url = getScrapableUrl(page);
    const isClosed = page.campaignStatus?.toLowerCase() === 'close';

    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}${page.name}${colors.reset} (${page.enPageId})`);
    console.log(`Status: ${page.campaignStatus || 'unknown'}`);
    console.log(`URL: ${url}`);

    if (isClosed) {
      console.log(`${colors.yellow}⏭️  SKIPPED (closed page)${colors.reset}\n`);
      continue;
    }

    try {
      const startTime = Date.now();
      const content = await scraper.scrapePage(url);
      const duration = Date.now() - startTime;

      results.total++;

      console.log(`${colors.green}✓ Scraped in ${duration}ms${colors.reset}`);

      if (content.h1) {
        console.log(`  ${colors.green}✓ H1:${colors.reset} "${content.h1}"`);
        results.h1++;
      } else {
        console.log(`  ${colors.yellow}✗ H1: Not found${colors.reset}`);
      }

      if (content.metaDescription) {
        const preview =
          content.metaDescription.length > 50
            ? content.metaDescription.substring(0, 50) + '...'
            : content.metaDescription;
        console.log(`  ${colors.green}✓ Meta:${colors.reset} "${preview}"`);
        results.meta++;
      } else {
        console.log(`  ${colors.yellow}✗ Meta: Not found${colors.reset}`);
      }

      if (content.cta.length > 0) {
        console.log(`  ${colors.green}✓ CTAs:${colors.reset} ${content.cta.join(', ')}`);
        results.cta++;
      } else {
        console.log(`  ${colors.yellow}✗ CTAs: None found${colors.reset}`);
      }

      if (content.donationAmounts.length > 0) {
        console.log(
          `  ${colors.green}✓ Amounts:${colors.reset} ${content.donationAmounts.map((a) => `$${a}`).join(', ')}`
        );
        results.amounts++;
      } else {
        console.log(`  ${colors.yellow}✗ Amounts: None found${colors.reset}`);
      }

      console.log('');
    } catch (error: any) {
      console.log(`${colors.red}✗ Failed: ${error.message}${colors.reset}\n`);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}\n📊 Results${colors.reset}\n`);
  console.log(`Total scraped: ${results.total}`);
  console.log(
    `With H1: ${results.h1}/${results.total} (${Math.round((results.h1 / results.total) * 100)}%)`
  );
  console.log(
    `With Meta: ${results.meta}/${results.total} (${Math.round((results.meta / results.total) * 100)}%)`
  );
  console.log(
    `With CTA: ${results.cta}/${results.total} (${Math.round((results.cta / results.total) * 100)}%)`
  );
  console.log(
    `With Amounts: ${results.amounts}/${results.total} (${Math.round((results.amounts / results.total) * 100)}%)\n`
  );

  await prisma.$disconnect();
}

main().catch(console.error);
