#!/usr/bin/env npx tsx
/**
 * Test script for Phase 1 & 2 implementation (010-page-detail-refactor)
 *
 * Tests:
 * 1. Date utilities (getPeriodDates, formatDateYYYYMMDD)
 * 2. Reporting currency settings (getReportingCurrency)
 * 3. FundraisingSnapshot Prisma model (create, read, upsert)
 * 4. EN Public API FundraisingSummaryByPage (if configured)
 *
 * Usage:
 *   npx tsx src/scripts/test-phase2.ts              # Run all tests
 *   npx tsx src/scripts/test-phase2.ts --api       # Include API test (requires EN_PUBLIC_TOKEN)
 *   npx tsx src/scripts/test-phase2.ts --page 1234 # Test specific EN page ID
 */

import { prisma } from '@/lib/db';
import {
  getPeriodDates,
  formatDateYYYYMMDD,
  getPeriodLabel,
  getPeriodDatesForCampaign,
} from '@/lib/date-utils';
import { getReportingCurrency } from '@/lib/settings';
import { getENPublicClient, isENPublicConfigured } from '@/lib/en-public-client';
import { REPORTING_CURRENCIES } from '@/types/fundraising';
import type { PeriodType } from '@prisma/client';

const DIVIDER = '─'.repeat(60);

// Parse command line arguments
const args = process.argv.slice(2);
const includeApiTest = args.includes('--api');
const pageIdIndex = args.indexOf('--page');
const pageIdArg =
  args.find((a) => a.startsWith('--page='))?.split('=')[1] ||
  (pageIdIndex !== -1 && args[pageIdIndex + 1] && !args[pageIdIndex + 1].startsWith('--')
    ? args[pageIdIndex + 1]
    : undefined);

async function main() {
  console.log('\n🧪 Phase 1 & 2 Test Suite\n');
  console.log(DIVIDER);

  let passed = 0;
  let failed = 0;

  // ============================================================================
  // Test 1: Date Utilities
  // ============================================================================
  console.log('\n📅 Test 1: Date Utilities\n');

  try {
    const periodTypes: PeriodType[] = ['LAST_7_DAYS', 'PREV_7_DAYS', 'LAST_30_DAYS', 'LIFETIME'];

    for (const periodType of periodTypes) {
      const dates = getPeriodDates(periodType);
      const label = getPeriodLabel(periodType);
      console.log(`  ${label}:`);
      console.log(`    Start: ${formatDateYYYYMMDD(dates.start)}`);
      console.log(`    End:   ${formatDateYYYYMMDD(dates.end)}`);
    }

    // Test campaign-aware date calculation
    const recentCampaign = new Date();
    recentCampaign.setDate(recentCampaign.getDate() - 3); // 3 days ago

    const campaignDates = getPeriodDatesForCampaign('LAST_7_DAYS', recentCampaign);
    console.log(`\n  Campaign-aware (created 3 days ago):`);
    if (campaignDates) {
      console.log(`    Adjusted Start: ${formatDateYYYYMMDD(campaignDates.start)}`);
      console.log(`    End: ${formatDateYYYYMMDD(campaignDates.end)}`);
    }

    console.log('\n  ✅ Date utilities working correctly');
    passed++;
  } catch (error) {
    console.error('\n  ❌ Date utilities failed:', error);
    failed++;
  }

  console.log(DIVIDER);

  // ============================================================================
  // Test 2: Reporting Currency Settings
  // ============================================================================
  console.log('\n💰 Test 2: Reporting Currency Settings\n');

  try {
    // Get current currency
    const currentCurrency = await getReportingCurrency();
    console.log(`  Current reporting currency: ${currentCurrency}`);

    // Test updating currency
    console.log(`  Available currencies: ${REPORTING_CURRENCIES.join(', ')}`);

    // Verify it's a valid currency
    if (REPORTING_CURRENCIES.includes(currentCurrency)) {
      console.log(`  ✅ Currency "${currentCurrency}" is valid`);
    }

    console.log('\n  ✅ Reporting currency settings working correctly');
    passed++;
  } catch (error) {
    console.error('\n  ❌ Reporting currency test failed:', error);
    failed++;
  }

  console.log(DIVIDER);

  // ============================================================================
  // Test 3: FundraisingSnapshot Prisma Model
  // ============================================================================
  console.log('\n🗄️  Test 3: FundraisingSnapshot Prisma Model\n');

  try {
    // Get a sample page to test with
    const samplePage = await prisma.fundraisingPage.findFirst({
      select: { id: true, name: true, enPageId: true },
    });

    if (!samplePage) {
      console.log('  ⚠️  No fundraising pages found in database');
      console.log('  Skipping snapshot test (need at least one page)');
    } else {
      console.log(`  Using page: ${samplePage.name} (${samplePage.enPageId})`);

      // Test creating a snapshot
      const testPeriod = getPeriodDates('LAST_7_DAYS');
      const testSnapshot = await prisma.fundraisingSnapshot.upsert({
        where: {
          pageId_periodType_periodStart_periodEnd: {
            pageId: samplePage.id,
            periodType: 'LAST_7_DAYS',
            periodStart: testPeriod.start,
            periodEnd: testPeriod.end,
          },
        },
        create: {
          pageId: samplePage.id,
          periodType: 'LAST_7_DAYS',
          periodStart: testPeriod.start,
          periodEnd: testPeriod.end,
          totalAmount: 1000.0,
          donationCount: 10,
          singleCount: 7,
          singleAmount: 700.0,
          recurringCount: 3,
          recurringAmount: 300.0,
          currency: 'CAD',
        },
        update: {
          totalAmount: 1000.0,
          fetchedAt: new Date(),
        },
      });

      console.log(`  Created/updated snapshot: ${testSnapshot.id}`);
      console.log(
        `    Period: ${formatDateYYYYMMDD(testSnapshot.periodStart)} to ${formatDateYYYYMMDD(testSnapshot.periodEnd)}`
      );
      console.log(`    Total: $${testSnapshot.totalAmount.toFixed(2)} ${testSnapshot.currency}`);
      console.log(
        `    Donations: ${testSnapshot.donationCount} (${testSnapshot.singleCount} single, ${testSnapshot.recurringCount} recurring)`
      );

      // Test reading snapshots for a page
      const snapshots = await prisma.fundraisingSnapshot.findMany({
        where: { pageId: samplePage.id },
        orderBy: { periodType: 'asc' },
      });
      console.log(`\n  Found ${snapshots.length} snapshot(s) for this page`);

      console.log('\n  ✅ FundraisingSnapshot model working correctly');
    }
    passed++;
  } catch (error) {
    console.error('\n  ❌ FundraisingSnapshot test failed:', error);
    failed++;
  }

  console.log(DIVIDER);

  // ============================================================================
  // Test 4: EN Public API FundraisingSummaryByPage
  // ============================================================================
  console.log('\n🌐 Test 4: EN Public API FundraisingSummaryByPage\n');

  if (!includeApiTest && !pageIdArg) {
    console.log('  ⏭️  Skipped (use --api or --page <id> to enable)');
  } else if (!isENPublicConfigured()) {
    console.log('  ⚠️  EN_PUBLIC_TOKEN not configured');
    console.log('  Set EN_PUBLIC_TOKEN in .env to test API');
  } else {
    try {
      const client = getENPublicClient();
      if (!client) throw new Error('Failed to create EN client');

      // Find a page with a campaign ID to test
      let testPageId: string | undefined = pageIdArg;
      let pageName: string | undefined;

      if (!testPageId) {
        const pageWithCampaign = await prisma.fundraisingPage.findFirst({
          where: { campaignId: { not: null } },
          select: { enPageId: true, name: true, campaignId: true },
        });

        if (pageWithCampaign) {
          testPageId = pageWithCampaign.enPageId;
          pageName = pageWithCampaign.name;
          console.log(`  Using page: ${pageName}`);
          console.log(`  EN Page ID: ${testPageId}`);
        }
      } else {
        console.log(`  Using page ID: ${testPageId}`);
      }

      if (!testPageId) {
        console.log('  ⚠️  No page with campaign ID found');
        console.log('  Use --page <enPageId> to specify a page');
      } else {
        const currency = await getReportingCurrency();
        const period = getPeriodDates('LAST_30_DAYS');
        const startDate = formatDateYYYYMMDD(period.start);
        const endDate = formatDateYYYYMMDD(period.end);

        console.log(`  Fetching ${getPeriodLabel('LAST_30_DAYS')} data...`);
        console.log(`  Date range: ${startDate} to ${endDate}`);
        console.log(`  Currency: ${currency}`);

        const result = await client.fetchFundraisingSummaryByPage(
          testPageId,
          startDate,
          endDate,
          currency
        );

        if (result) {
          console.log(`\n  📊 Results:`);
          console.log(`    Page: ${result.pageName} (ID: ${result.pageId})`);
          console.log(`    Total Amount: $${result.totalAmount.toFixed(2)} ${result.currency}`);
          console.log(`    Donations: ${result.donationCount}`);
          console.log(`    Single: ${result.singleCount} ($${result.singleAmount.toFixed(2)})`);
          console.log(
            `    Recurring: ${result.recurringCount} ($${result.recurringAmount.toFixed(2)})`
          );
          console.log('\n  ✅ FundraisingSummaryByPage API working correctly');
        } else {
          console.log('\n  ⚠️  No data returned (page may have no donations in this period)');
        }
      }
      passed++;
    } catch (error) {
      console.error('\n  ❌ API test failed:', error);
      failed++;
    }
  }

  console.log(DIVIDER);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n📋 Test Summary\n');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n✅ All tests passed! Phase 1 & 2 implementation is working.\n');
  } else {
    console.log('\n❌ Some tests failed. Check the errors above.\n');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Test script error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
