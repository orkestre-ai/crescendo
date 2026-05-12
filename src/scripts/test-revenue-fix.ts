/**
 * Test Script: GA4 Purchase Data Fix Verification
 *
 * Tests that both conversions AND revenue now come from purchase events
 * on the confirmation page (/donate/2), not the generic GA4 conversions metric.
 *
 * Usage:
 *   npx tsx src/scripts/test-revenue-fix.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from project root FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { BetaAnalyticsDataClient } from '@google-analytics/data';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function testPurchaseDataFix() {
  console.log(colors.bright + '\n🧪 Testing GA4 Purchase Data Fix' + colors.reset);
  console.log('   Conversions = purchase event count (not generic GA4 conversions)');
  console.log('   Revenue = purchase event value');
  console.log('═'.repeat(70));

  const credentialsJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!credentialsJson) {
    console.error('❌ GA4_SERVICE_ACCOUNT_KEY not set');
    process.exit(1);
  }

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    console.error('❌ GA4_PROPERTY_ID not set');
    process.exit(1);
  }

  const credentials = JSON.parse(credentialsJson);
  const client = new BetaAnalyticsDataClient({ credentials });

  // Helper to get metrics using our NEW logic (purchase events only)
  async function getMetricsNewLogic(pagePath: string, startDate: string, endDate: string) {
    // Get page metrics from form page (/donate/1) - NO generic conversions
    const [metricsResponse] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { value: pagePath },
        },
      },
    });

    // Extract page ID and get purchase data from confirmation page (/donate/2)
    const pageIdMatch = pagePath.match(/\/page\/(\d+)\//);
    const pageId = pageIdMatch?.[1];
    const confirmationPath = pageId ? `/page/${pageId}/donate/2` : pagePath;

    let conversions = 0;
    let revenue = 0;

    if (pageId) {
      const [purchaseResponse] = await client.runReport({
        property: propertyId,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'eventCount' }, // Purchase count = conversions
          { name: 'eventValue' }, // Revenue
        ],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } } },
              { filter: { fieldName: 'pagePath', stringFilter: { value: confirmationPath } } },
            ],
          },
        },
      });
      conversions = parseInt(purchaseResponse.rows?.[0]?.metricValues?.[0]?.value || '0');
      revenue = parseFloat(purchaseResponse.rows?.[0]?.metricValues?.[1]?.value || '0');
    }

    const row = metricsResponse.rows?.[0];
    return {
      pageViews: parseInt(row?.metricValues?.[0]?.value || '0'),
      bounceRate: parseFloat(row?.metricValues?.[1]?.value || '0'),
      conversions,
      revenue,
      avgSessionDuration: parseFloat(row?.metricValues?.[2]?.value || '0'),
      confirmationPath,
    };
  }

  // Helper to get OLD logic (generic conversions metric)
  async function getMetricsOldLogic(pagePath: string, startDate: string, endDate: string) {
    const [response] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'conversions' }, // Generic conversions (includes scroll, sign_up, etc.)
        { name: 'averageSessionDuration' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { value: pagePath },
        },
      },
    });

    const row = response.rows?.[0];
    return {
      conversions: parseInt(row?.metricValues?.[2]?.value || '0'),
    };
  }

  // Test pages
  const testPages = [
    { id: '179818', name: 'High revenue page' },
    { id: '181859', name: 'Donation - DRTV' },
    { id: '164200', name: 'Emergency - Gaza' },
  ];

  for (const page of testPages) {
    const pagePath = `/page/${page.id}/donate/1`;

    console.log(colors.cyan + `\n📊 Page ${page.id} (${page.name})` + colors.reset);
    console.log('─'.repeat(70));

    try {
      const [newMetrics, oldMetrics] = await Promise.all([
        getMetricsNewLogic(pagePath, '2025-11-01', '2025-11-27'),
        getMetricsOldLogic(pagePath, '2025-11-01', '2025-11-27'),
      ]);

      console.log('  Form page:', pagePath);
      console.log('  Purchase data from:', newMetrics.confirmationPath);
      console.log('');
      console.log('  Page Views:', newMetrics.pageViews);
      console.log('');
      console.log(
        colors.dim + '  OLD Conversions (generic):' + colors.reset,
        oldMetrics.conversions,
        colors.dim + '← includes scroll, sign_up, etc.' + colors.reset
      );
      console.log(
        colors.bright + '  NEW Conversions (purchases):' + colors.reset,
        newMetrics.conversions,
        newMetrics.conversions > 0
          ? colors.green + '✅' + colors.reset
          : colors.yellow + '⚠️' + colors.reset
      );
      console.log('');
      console.log(
        colors.bright + '  Revenue: $' + newMetrics.revenue.toFixed(2) + colors.reset,
        newMetrics.revenue > 0
          ? colors.green + '✅' + colors.reset
          : colors.yellow + '⚠️' + colors.reset
      );

      // Show conversion rate
      if (newMetrics.pageViews > 0) {
        const conversionRate = ((newMetrics.conversions / newMetrics.pageViews) * 100).toFixed(2);
        console.log(colors.dim + `  Conversion Rate: ${conversionRate}%` + colors.reset);
      }
    } catch (error) {
      console.error(
        colors.red + '  Error:' + colors.reset,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log(colors.green + '✅ Purchase data fix test complete!' + colors.reset);
  console.log('   Conversions now = purchase events only (actual donations)');
  console.log('   Revenue now = purchase event value from confirmation page\n');
}

testPurchaseDataFix().catch(console.error);
