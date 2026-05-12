/**
 * Debug Script: GA4 Revenue Investigation
 *
 * Investigates revenue tracking in GA4 to understand why revenue is $0.
 * Tests various metrics and event-based approaches to capture donation revenue.
 *
 * Usage:
 *   npx tsx src/scripts/debug-ga4-revenue.ts
 *   npx tsx src/scripts/debug-ga4-revenue.ts --page "/page/181859/donate/1"
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
  magenta: '\x1b[35m',
};

async function debugGA4Revenue() {
  const args = process.argv.slice(2);

  // Parse arguments
  const pageFilter = args.includes('--page') ? args[args.indexOf('--page') + 1] : null;

  console.log(colors.bright + '\n💰 GA4 Revenue Investigation\n' + colors.reset);

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

  // Calculate date range (last 30 days)
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 29);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  console.log(
    colors.blue + 'Date Range:' + colors.reset,
    `${startDateStr} to ${endDateStr} (30 days)`
  );

  if (pageFilter) {
    console.log(colors.blue + 'Page Filter:' + colors.reset, pageFilter);
  }

  console.log('');

  // Initialize GA4 client
  const credentials = JSON.parse(credentialsJson);
  const client = new BetaAnalyticsDataClient({ credentials });

  // ============================================
  // TEST 1: Standard Revenue Metrics
  // ============================================
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + '📊 TEST 1: Standard Revenue Metrics' + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);

  try {
    const revenueMetrics = [
      'totalRevenue',
      'purchaseRevenue',
      'ecommercePurchases',
      'transactions',
      'itemRevenue',
      'averagePurchaseRevenue',
    ];

    const request: any = {
      property: propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      metrics: revenueMetrics.map((name) => ({ name })),
    };

    if (pageFilter) {
      request.dimensions = [{ name: 'pagePath' }];
      request.dimensionFilter = {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { matchType: 'CONTAINS', value: pageFilter },
        },
      };
    }

    console.log('\nRequesting metrics:', revenueMetrics.join(', '));

    const [response] = await client.runReport(request);

    console.log('\n' + colors.green + 'Results:' + colors.reset);

    if (response.rows && response.rows.length > 0) {
      for (const row of response.rows) {
        if (pageFilter && row.dimensionValues?.[0]) {
          console.log(colors.dim + `  Page: ${row.dimensionValues[0].value}` + colors.reset);
        }
        row.metricValues?.forEach((val, idx) => {
          const metricName = revenueMetrics[idx];
          const value = parseFloat(val.value || '0');
          const display = metricName.includes('Revenue')
            ? `$${value.toFixed(2)}`
            : value.toString();
          const color = value > 0 ? colors.green : colors.yellow;
          console.log(`  ${color}${metricName}: ${display}${colors.reset}`);
        });
      }
    } else {
      console.log(colors.yellow + '  No data found' + colors.reset);
    }
  } catch (error: any) {
    console.log(colors.red + '  Error: ' + error.message + colors.reset);
    // Some metrics might not be available - that's OK
  }

  // ============================================
  // TEST 2: Event-Based Revenue (purchase events)
  // ============================================
  console.log('\n' + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + '📊 TEST 2: Purchase Events Analysis' + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);

  try {
    const request: any = {
      property: propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'CONTAINS', value: 'purchase' },
              },
            },
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'CONTAINS', value: 'donate' },
              },
            },
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'CONTAINS', value: 'donation' },
              },
            },
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'CONTAINS', value: 'transaction' },
              },
            },
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'CONTAINS', value: 'payment' },
              },
            },
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'CONTAINS', value: 'conversion' },
              },
            },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 20,
    };

    console.log('\nSearching for revenue-related events...');

    const [response] = await client.runReport(request);

    console.log('\n' + colors.green + 'Revenue-Related Events Found:' + colors.reset);

    if (response.rows && response.rows.length > 0) {
      console.log('─'.repeat(60));
      console.log(
        colors.dim +
          'Event Name'.padEnd(40) +
          'Count'.padStart(10) +
          'Value'.padStart(10) +
          colors.reset
      );
      console.log('─'.repeat(60));

      for (const row of response.rows) {
        const eventName = row.dimensionValues?.[0]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0');
        const value = parseFloat(row.metricValues?.[1]?.value || '0');

        console.log(
          colors.green +
            eventName.padEnd(40) +
            count.toString().padStart(10) +
            `$${value.toFixed(2)}`.padStart(10) +
            colors.reset
        );
      }
    } else {
      console.log(colors.yellow + '  No purchase/donation events found' + colors.reset);
      console.log(colors.dim + '  This might explain why revenue is $0' + colors.reset);
    }
  } catch (error: any) {
    console.log(colors.red + '  Error: ' + error.message + colors.reset);
  }

  // ============================================
  // TEST 3: All Events (to see what's being tracked)
  // ============================================
  console.log('\n' + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + '📊 TEST 3: All Events Overview' + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);

  try {
    const request: any = {
      property: propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 30,
    };

    console.log('\nListing all tracked events...');

    const [response] = await client.runReport(request);

    console.log('\n' + colors.green + 'All Events (Top 30 by count):' + colors.reset);

    if (response.rows && response.rows.length > 0) {
      console.log('─'.repeat(60));
      console.log(
        colors.dim +
          'Event Name'.padEnd(40) +
          'Count'.padStart(10) +
          'Value'.padStart(10) +
          colors.reset
      );
      console.log('─'.repeat(60));

      for (const row of response.rows) {
        const eventName = row.dimensionValues?.[0]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0');
        const value = parseFloat(row.metricValues?.[1]?.value || '0');

        // Highlight potentially revenue-related events
        const isRevenueRelated = [
          'purchase',
          'donate',
          'transaction',
          'payment',
          'conversion',
          'submit',
        ].some((keyword) => eventName.toLowerCase().includes(keyword));

        const color = isRevenueRelated ? colors.green : colors.dim;

        console.log(
          color +
            eventName.padEnd(40) +
            count.toString().padStart(10) +
            (value > 0 ? `$${value.toFixed(2)}` : '-').padStart(10) +
            colors.reset
        );
      }
    }
  } catch (error: any) {
    console.log(colors.red + '  Error: ' + error.message + colors.reset);
  }

  // ============================================
  // TEST 4: Conversions Analysis
  // ============================================
  console.log('\n' + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + '📊 TEST 4: Conversions Analysis' + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);

  try {
    const request: any = {
      property: propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [{ name: 'eventName' }, { name: 'isConversionEvent' }],
      metrics: [{ name: 'eventCount' }, { name: 'conversions' }, { name: 'eventValue' }],
      dimensionFilter: {
        filter: {
          fieldName: 'isConversionEvent',
          stringFilter: { value: 'true' },
        },
      },
      orderBys: [{ metric: { metricName: 'conversions' }, desc: true }],
      limit: 20,
    };

    console.log('\nListing conversion events...');

    const [response] = await client.runReport(request);

    console.log('\n' + colors.green + 'Conversion Events:' + colors.reset);

    if (response.rows && response.rows.length > 0) {
      console.log('─'.repeat(70));
      console.log(
        colors.dim +
          'Event Name'.padEnd(35) +
          'Events'.padStart(10) +
          'Conversions'.padStart(12) +
          'Value'.padStart(13) +
          colors.reset
      );
      console.log('─'.repeat(70));

      for (const row of response.rows) {
        const eventName = row.dimensionValues?.[0]?.value || '';
        const eventCount = parseInt(row.metricValues?.[0]?.value || '0');
        const conversions = parseInt(row.metricValues?.[1]?.value || '0');
        const value = parseFloat(row.metricValues?.[2]?.value || '0');

        console.log(
          colors.green +
            eventName.padEnd(35) +
            eventCount.toString().padStart(10) +
            conversions.toString().padStart(12) +
            (value > 0 ? `$${value.toFixed(2)}` : '-').padStart(13) +
            colors.reset
        );
      }
    } else {
      console.log(colors.yellow + '  No conversion events found' + colors.reset);
    }
  } catch (error: any) {
    console.log(colors.red + '  Error: ' + error.message + colors.reset);
  }

  // ============================================
  // TEST 5: Custom Event Parameters (if purchase events exist)
  // ============================================
  console.log('\n' + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + '📊 TEST 5: Event Parameters Check' + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);

  try {
    // Check for custom parameters that might contain revenue data
    const request: any = {
      property: propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [
        { name: 'eventName' },
        { name: 'customEvent:value' }, // Custom parameter
      ],
      metrics: [{ name: 'eventCount' }],
      limit: 20,
    };

    console.log('\nChecking for custom event parameters...');

    const [response] = await client.runReport(request);

    if (response.rows && response.rows.length > 0) {
      console.log(colors.green + '\nCustom event parameters found:' + colors.reset);
      for (const row of response.rows) {
        console.log(
          `  ${row.dimensionValues?.[0]?.value}: ${row.dimensionValues?.[1]?.value || '(none)'}`
        );
      }
    }
  } catch {
    // Custom parameters might not exist
    console.log(colors.dim + '  No custom event parameters found or accessible' + colors.reset);
  }

  // ============================================
  // SUMMARY & RECOMMENDATIONS
  // ============================================
  console.log('\n' + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + '📋 SUMMARY & RECOMMENDATIONS' + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset);

  console.log(`
${colors.yellow}Based on the investigation:${colors.reset}

1. ${colors.bright}If no 'purchase' events are found:${colors.reset}
   - The Engaging Networks donation pages may not be firing GA4 purchase events
   - Revenue tracking requires proper e-commerce event implementation
   - EN might be using a different tracking mechanism

2. ${colors.bright}Alternative approaches to track donation revenue:${colors.reset}
   
   a) ${colors.green}Use the EN API directly:${colors.reset}
      - EN tracks all donations internally
      - We could fetch donation data from EN API instead of GA4
      - This would be more accurate for donation amounts
   
   b) ${colors.green}Track form submissions as proxy:${colors.reset}
      - If 'form_submit' events are tracked, use those as conversion indicators
      - Won't have exact amounts but shows conversion activity
   
   c) ${colors.green}Event value mapping:${colors.reset}
      - If EN fires custom events with value parameters
      - Map those to revenue in our system

3. ${colors.bright}Recommended next steps:${colors.reset}
   - Check EN admin for their GA4 integration settings
   - Verify what events EN pages fire (check browser dev tools)
   - Consider adding EN API endpoint for donation totals

${colors.cyan}═══════════════════════════════════════════════════════════════════════════════${colors.reset}
`);
}

debugGA4Revenue().catch(console.error);
