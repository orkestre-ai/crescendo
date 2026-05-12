/**
 * Test Script: GA4 Metrics Collection
 *
 * Tests the Google Analytics 4 integration to ensure we can retrieve
 * page metrics for all synced pages.
 *
 * Usage:
 *   npx tsx scripts/test-ga4-metrics.ts                 # Test first 5 pages
 *   npx tsx scripts/test-ga4-metrics.ts --all           # Test all active pages
 *   npx tsx scripts/test-ga4-metrics.ts --id <pageId>   # Test specific page
 *   npx tsx scripts/test-ga4-metrics.ts --days 7        # Test last 7 days
 */

// Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Now import modules that depend on environment variables
import { PrismaClient } from '@prisma/client';

// Delay import of getGa4Client until after env is loaded
let ga4Client: any;
let prisma: any;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color: string, label: string, message: string) {
  console.log(`${color}${label}${colors.reset} ${message}`);
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatCurrency(num: number): string {
  return `$${num.toFixed(2)}`;
}

function formatPercent(num: number): string {
  return `${(num * 100).toFixed(2)}%`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

async function testGA4Metrics() {
  // Initialize prisma and ga4Client after env is loaded
  prisma = new PrismaClient();
  const { getGa4Client } = await import('../lib/google-analytics');
  ga4Client = await getGa4Client();

  const args = process.argv.slice(2);

  console.log(colors.bright + '\n🧪 GA4 Metrics Collection Test\n' + colors.reset);

  // Parse arguments
  const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 1;

  // Calculate date range (yesterday by default)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  log(
    colors.blue,
    '📅 Date Range:',
    `${startDateStr} to ${endDateStr} (${days} day${days > 1 ? 's' : ''})`
  );

  // Get pages to test
  let pages;
  if (args.includes('--id')) {
    const idIndex = args.indexOf('--id');
    const id = args[idIndex + 1];
    const page = await prisma.fundraisingPage.findUnique({ where: { id } });
    if (!page) {
      console.error(colors.red + `❌ Page not found with ID: ${id}` + colors.reset);
      process.exit(1);
    }
    pages = [page];
  } else if (args.includes('--all')) {
    pages = await prisma.fundraisingPage.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { enPageId: 'asc' },
    });
    log(colors.blue, '🔍 Testing:', `All ${pages.length} active pages`);
  } else {
    // Default: test first 5 pages
    pages = await prisma.fundraisingPage.findMany({
      where: { status: 'ACTIVE' },
      take: 5,
      orderBy: { enPageId: 'asc' },
    });
    log(colors.blue, '🔍 Testing:', `First ${pages.length} pages (use --all for all pages)`);
  }

  console.log('');

  // Results tracking
  const results = {
    total: pages.length,
    successful: 0,
    failed: 0,
    withData: 0,
    withConversions: 0,
    withRevenue: 0,
    totalPageViews: 0,
    totalConversions: 0,
    totalRevenue: 0,
    errors: [] as string[],
  };

  // Test each page
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200)); // Rate limiting
    }

    console.log(colors.cyan + '━'.repeat(80) + colors.reset);
    log(colors.bright, '📄 Page:', `${page.name} (EN: ${page.enPageId})`);
    log(colors.dim, '   URL:', page.url);

    try {
      // Extract page path from URL
      const url = new URL(page.url);
      const pagePath = url.pathname;

      log(colors.dim, '   Path:', pagePath);
      console.log('');

      const startTime = Date.now();

      // Call GA4 API
      log(colors.cyan, '🔄 Fetching:', 'GA4 metrics...');
      const metrics = await ga4Client.getPageMetrics(pagePath, startDateStr, endDateStr);

      const duration = Date.now() - startTime;
      log(colors.green, '✅ Retrieved:', `in ${duration}ms`);
      console.log('');

      // Display metrics
      console.log(colors.bright + '📊 Metrics:' + colors.reset);

      const hasData = metrics.pageViews > 0;

      if (!hasData) {
        log(colors.yellow, '  ⚠️  Warning:', 'No data for this page in date range');
      }

      log(hasData ? colors.green : colors.dim, '  Page Views:', formatNumber(metrics.pageViews));
      log(hasData ? colors.green : colors.dim, '  Bounce Rate:', formatPercent(metrics.bounceRate));
      log(
        metrics.conversions > 0 ? colors.green : colors.dim,
        '  Conversions:',
        formatNumber(metrics.conversions)
      );
      log(
        metrics.revenue > 0 ? colors.green : colors.dim,
        '  Revenue:',
        formatCurrency(metrics.revenue)
      );
      log(
        hasData ? colors.green : colors.dim,
        '  Avg Duration:',
        formatDuration(metrics.avgSessionDuration)
      );

      if (metrics.pageViews > 0) {
        const conversionRate = (metrics.conversions / metrics.pageViews) * 100;
        const revenuePerView = metrics.revenue / metrics.pageViews;

        console.log('');
        console.log(colors.dim + '  Calculated:' + colors.reset);
        log(colors.dim, '    Conversion Rate:', `${conversionRate.toFixed(2)}%`);
        log(colors.dim, '    Revenue per View:', formatCurrency(revenuePerView));
      }

      console.log('');

      // Update results
      results.successful++;
      if (hasData) results.withData++;
      if (metrics.conversions > 0) results.withConversions++;
      if (metrics.revenue > 0) results.withRevenue++;
      results.totalPageViews += metrics.pageViews;
      results.totalConversions += metrics.conversions;
      results.totalRevenue += metrics.revenue;
    } catch (error: any) {
      results.failed++;
      results.errors.push(`${page.name}: ${error.message}`);

      console.log('');
      log(colors.red, '❌ Error:', error.message);

      if (error.code) {
        log(colors.red, '   Code:', error.code);
      }
      if (error.details) {
        log(colors.red, '   Details:', error.details);
      }

      console.log('');
    }
  }

  // Summary
  console.log(colors.cyan + '━'.repeat(80) + colors.reset);
  console.log(colors.bright + '\n📊 Test Summary\n' + colors.reset);

  log(colors.blue, '  Total Pages:', results.total.toString());
  log(
    colors.green,
    '  Successful:',
    `${results.successful} (${Math.round((results.successful / results.total) * 100)}%)`
  );

  if (results.failed > 0) {
    log(
      colors.red,
      '  Failed:',
      `${results.failed} (${Math.round((results.failed / results.total) * 100)}%)`
    );
  }

  console.log('');

  log(
    colors.cyan,
    '  With Data:',
    `${results.withData} / ${results.successful} (${Math.round((results.withData / results.successful) * 100)}%)`
  );
  log(
    colors.cyan,
    '  With Conversions:',
    `${results.withConversions} / ${results.successful} (${Math.round((results.withConversions / results.successful) * 100)}%)`
  );
  log(
    colors.cyan,
    '  With Revenue:',
    `${results.withRevenue} / ${results.successful} (${Math.round((results.withRevenue / results.successful) * 100)}%)`
  );

  console.log('');
  console.log(colors.bright + '📈 Totals:' + colors.reset);
  log(colors.green, '  Total Page Views:', formatNumber(results.totalPageViews));
  log(colors.green, '  Total Conversions:', formatNumber(results.totalConversions));
  log(colors.green, '  Total Revenue:', formatCurrency(results.totalRevenue));

  if (results.totalPageViews > 0) {
    const overallConversionRate = (results.totalConversions / results.totalPageViews) * 100;
    const avgRevenuePerConversion =
      results.totalConversions > 0 ? results.totalRevenue / results.totalConversions : 0;

    console.log('');
    log(colors.cyan, '  Overall Conversion Rate:', `${overallConversionRate.toFixed(2)}%`);
    log(colors.cyan, '  Avg Revenue per Conversion:', formatCurrency(avgRevenuePerConversion));
  }

  // Show errors if any
  if (results.errors.length > 0) {
    console.log('');
    console.log(colors.red + '❌ Errors:' + colors.reset);
    results.errors.forEach((error) => {
      console.log(`  ${colors.dim}•${colors.reset} ${error}`);
    });
  }

  // Recommendations
  console.log('');
  console.log(colors.bright + '💡 Recommendations:' + colors.reset);

  if (results.withData === 0) {
    console.log(`  ${colors.yellow}⚠️  No GA4 data found for any pages${colors.reset}`);
    console.log(`     - Check that pages are receiving traffic`);
    console.log(`     - Verify GA4 property ID: ${process.env.GA4_PROPERTY_ID}`);
    console.log(`     - Confirm service account has Viewer access`);
    console.log(`     - Check page paths match GA4 data (case-sensitive)`);
  } else if (results.withData < results.successful * 0.5) {
    console.log(`  ${colors.yellow}⚠️  Less than 50% of pages have data${colors.reset}`);
    console.log(`     - Some pages may not be receiving traffic`);
    console.log(`     - Check date range (currently: ${days} day${days > 1 ? 's' : ''})`);
  } else {
    console.log(
      `  ${colors.green}✓ Good data coverage (${Math.round((results.withData / results.successful) * 100)}%)${colors.reset}`
    );
  }

  if (results.withConversions === 0 && results.withData > 0) {
    console.log(`  ${colors.yellow}⚠️  No conversions detected${colors.reset}`);
    console.log(`     - Verify conversion events are set up in GA4`);
    console.log(`     - Check event tracking on donation pages`);
  }

  console.log('\n' + colors.cyan + '━'.repeat(80) + colors.reset + '\n');

  await prisma.$disconnect();
}

testGA4Metrics().catch((error) => {
  console.error(colors.red + '\n❌ Fatal error:' + colors.reset, error);
  process.exit(1);
});
