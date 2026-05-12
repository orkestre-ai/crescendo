/**
 * Debug Script: List all GA4 page paths
 *
 * Queries GA4 without filters to see what page paths are being tracked.
 * Helps debug why specific pages might not match.
 *
 * Usage:
 *   npx tsx src/scripts/debug-ga4-paths.ts
 *   npx tsx src/scripts/debug-ga4-paths.ts --filter "/page/181859"
 *   npx tsx src/scripts/debug-ga4-paths.ts --days 7
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { BetaAnalyticsDataClient } from '@google-analytics/data';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function debugGA4Paths() {
  const args = process.argv.slice(2);

  // Parse arguments
  const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 7;

  const filter = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : null;

  console.log(colors.bright + '\n🔍 GA4 Page Paths Debug\n' + colors.reset);

  // Get credentials
  const credentialsJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!credentialsJson) {
    console.error(colors.red + '❌ GA4_SERVICE_ACCOUNT_KEY not set' + colors.reset);
    process.exit(1);
  }

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    console.error(colors.red + '❌ GA4_PROPERTY_ID not set' + colors.reset);
    process.exit(1);
  }

  console.log(colors.blue + 'Property ID:' + colors.reset, propertyId);

  // Calculate date range
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  console.log(
    colors.blue + 'Date Range:' + colors.reset,
    `${startDateStr} to ${endDateStr} (${days} days)`
  );

  if (filter) {
    console.log(colors.blue + 'Filter:' + colors.reset, `Paths containing "${filter}"`);
  }

  console.log('');

  // Initialize GA4 client
  const credentials = JSON.parse(credentialsJson);
  const client = new BetaAnalyticsDataClient({ credentials });

  try {
    // Query without pagePath filter to see all paths
    const request: any = {
      property: propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'conversions' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 100,
    };

    // Add filter if specified (using contains)
    if (filter) {
      request.dimensionFilter = {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'CONTAINS',
            value: filter,
          },
        },
      };
    }

    console.log(colors.cyan + '📤 Request:' + colors.reset);
    console.log(JSON.stringify(request, null, 2));
    console.log('');

    const [response] = await client.runReport(request);

    console.log(colors.cyan + '📥 Response:' + colors.reset);
    console.log('Row Count:', response.rows?.length ?? 0);
    console.log('');

    if (!response.rows || response.rows.length === 0) {
      console.log(colors.yellow + '⚠️  No data found' + colors.reset);
      console.log('');
      console.log('Possible reasons:');
      console.log('  1. No traffic in the date range');
      console.log('  2. GA4 property ID might be incorrect');
      console.log('  3. Service account may not have access');
      return;
    }

    console.log(colors.green + '📊 Page Paths Found:\n' + colors.reset);
    console.log('─'.repeat(100));
    console.log(
      colors.dim +
        'Page Views'.padStart(12) +
        '  ' +
        'Conv'.padStart(8) +
        '  ' +
        'Path' +
        colors.reset
    );
    console.log('─'.repeat(100));

    for (const row of response.rows) {
      const pagePath = row.dimensionValues?.[0]?.value || '';
      const pageViews = parseInt(row.metricValues?.[0]?.value || '0');
      const conversions = parseInt(row.metricValues?.[1]?.value || '0');

      const viewsStr = pageViews.toLocaleString().padStart(12);
      const convStr = conversions.toLocaleString().padStart(8);

      // Highlight paths that might be EN pages
      const isENPage = pagePath.includes('/page/') || pagePath.includes('/donate');
      const pathColor = isENPage ? colors.green : colors.dim;

      console.log(`${viewsStr}  ${convStr}  ${pathColor}${pagePath}${colors.reset}`);
    }

    console.log('─'.repeat(100));
    console.log('');

    // Show totals
    const totalViews = response.rows.reduce(
      (sum, row) => sum + parseInt(row.metricValues?.[0]?.value || '0'),
      0
    );
    const totalConversions = response.rows.reduce(
      (sum, row) => sum + parseInt(row.metricValues?.[1]?.value || '0'),
      0
    );

    console.log(colors.bright + 'Totals:' + colors.reset);
    console.log(`  Page Views: ${totalViews.toLocaleString()}`);
    console.log(`  Conversions: ${totalConversions.toLocaleString()}`);
    console.log('');

    // Helpful tips
    if (!filter) {
      console.log(colors.cyan + '💡 Tips:' + colors.reset);
      console.log('  • Use --filter "/page/181859" to search for specific page IDs');
      console.log('  • Use --days 30 to look at a longer time range');
      console.log('  • EN pages typically have paths like /page/{id}/donate/1');
    }
  } catch (error: any) {
    console.error(colors.red + '❌ Error:' + colors.reset, error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }

  console.log('');
}

debugGA4Paths().catch(console.error);
