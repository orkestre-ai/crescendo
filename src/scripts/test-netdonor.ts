/**
 * Test Script: EN NetDonor Fundraising Data
 *
 * Tests the Engaging Networks Public API integration to verify:
 * 1. API connectivity with token validation
 * 2. NetDonor data fetch for campaigns
 * 3. Database storage of fundraising metrics
 *
 * Usage:
 *   npx tsx src/scripts/test-netdonor.ts                        # Test connection only
 *   npx tsx src/scripts/test-netdonor.ts --campaign <id>        # Fetch data for campaign
 *   npx tsx src/scripts/test-netdonor.ts --page <pageId>        # Fetch for page by ID
 *   npx tsx src/scripts/test-netdonor.ts --save                 # Save to database
 *   npx tsx src/scripts/test-netdonor.ts --all                  # Test all pages with campaign IDs
 */

// Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Now import modules that depend on environment variables
import { PrismaClient } from '@prisma/client';
import { ENPublicClient, isENPublicConfigured } from '../lib/en-public-client';
import { formatCurrency, formatNumber } from '../lib/currency-utils';
import { toFundraisingUpdateInput } from '../types/fundraising';

// ============================================================================
// CONSOLE FORMATTING
// ============================================================================

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

function separator() {
  console.log(colors.cyan + '━'.repeat(80) + colors.reset);
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

interface Args {
  campaignId?: number;
  pageId?: string;
  save: boolean;
  all: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    return { save: false, all: false, help: true };
  }

  let campaignId: number | undefined;
  let pageId: string | undefined;

  const campaignIndex = args.indexOf('--campaign');
  if (campaignIndex !== -1 && args[campaignIndex + 1]) {
    campaignId = parseInt(args[campaignIndex + 1], 10);
    if (isNaN(campaignId)) {
      console.error(colors.red + '❌ Invalid campaign ID' + colors.reset);
      process.exit(1);
    }
  }

  const pageIndex = args.indexOf('--page');
  if (pageIndex !== -1 && args[pageIndex + 1]) {
    pageId = args[pageIndex + 1];
  }

  return {
    campaignId,
    pageId,
    save: args.includes('--save'),
    all: args.includes('--all'),
    help: false,
  };
}

function showHelp() {
  console.log(`
${colors.bright}EN NetDonor Fundraising Data Test Script${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx tsx src/scripts/test-netdonor.ts [options]

${colors.cyan}Options:${colors.reset}
  --campaign <id>   Test with specific EN campaign ID
  --page <id>       Test with specific page (uses page's campaignId)
  --save            Save fetched data to database
  --all             Test all pages that have campaign IDs
  --help, -h        Show this help message

${colors.cyan}Examples:${colors.reset}
  # Test API connection only
  npx tsx src/scripts/test-netdonor.ts

  # Fetch data for campaign 12345
  npx tsx src/scripts/test-netdonor.ts --campaign 12345

  # Fetch and save data for a specific page
  npx tsx src/scripts/test-netdonor.ts --page clxxxx --save

  # Test all pages with campaign IDs
  npx tsx src/scripts/test-netdonor.ts --all

${colors.cyan}Environment:${colors.reset}
  EN_PUBLIC_TOKEN   Required. Get from EN Dashboard → Account Settings → Tokens
  EN_REGION         Optional. 'us' or 'ca' (default: 'ca')
`);
}

// ============================================================================
// MAIN TEST FUNCTIONS
// ============================================================================

async function testConnection(client: ENPublicClient): Promise<boolean> {
  log(colors.cyan, '🔄 Testing:', 'EN Public API connection...');

  try {
    const startTime = Date.now();
    await client.testConnection();
    const duration = Date.now() - startTime;

    log(colors.green, '✅ Success:', `Connected to EN Public API (${duration}ms)`);
    return true;
  } catch (error: any) {
    log(colors.red, '❌ Failed:', error.message);
    return false;
  }
}

async function fetchAndDisplayData(
  client: ENPublicClient,
  campaignId: number,
  _pageId?: string
): Promise<{ success: boolean; data?: any }> {
  log(colors.cyan, '🔄 Fetching:', `NetDonor data for campaign ${campaignId}...`);

  try {
    const startTime = Date.now();
    const data = await client.fetchNetDonor(campaignId);
    const duration = Date.now() - startTime;

    if (!data) {
      log(colors.yellow, '⚠️  Warning:', 'No data returned (campaign may have no donations)');
      return { success: true, data: null };
    }

    log(colors.green, '✅ Retrieved:', `in ${duration}ms`);
    console.log('');

    // Display the data
    console.log(colors.bright + '📊 Fundraising Data:' + colors.reset);
    log(colors.dim, '  Campaign ID:', data.campaignId.toString());
    log(colors.dim, '  Campaign Name:', data.campaignName);
    console.log('');

    log(colors.green, '  Total Donated:', formatCurrency(data.totalDonated));
    log(colors.green, '  Highest Donation:', formatCurrency(data.highestDonation));
    log(colors.green, '  Average Donation:', formatCurrency(data.averageDonation));
    console.log('');

    log(colors.blue, '  Registrations:', formatNumber(data.registrations));
    log(colors.blue, '  Supporters:', formatNumber(data.supporters));
    log(colors.blue, '  Page Hits:', formatNumber(data.pageHits));
    console.log('');

    log(colors.dim, '  Fetched At:', data.fetchedAt.toISOString());

    return { success: true, data };
  } catch (error: any) {
    log(colors.red, '❌ Error:', error.message);
    return { success: false };
  }
}

async function saveToDatabase(prisma: PrismaClient, pageId: string, data: any): Promise<boolean> {
  log(colors.cyan, '💾 Saving:', `Data to database for page ${pageId}...`);

  try {
    const updateInput = toFundraisingUpdateInput(data);

    await prisma.fundraisingPage.update({
      where: { id: pageId },
      data: updateInput,
    });

    log(colors.green, '✅ Saved:', 'Fundraising data stored in database');
    return true;
  } catch (error: any) {
    log(colors.red, '❌ Error:', `Failed to save: ${error.message}`);
    return false;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  console.log(colors.bright + '\n🧪 EN NetDonor Fundraising Data Test\n' + colors.reset);

  // Check configuration
  if (!isENPublicConfigured()) {
    log(colors.red, '❌ Error:', 'EN_PUBLIC_TOKEN is not configured');
    console.log('');
    console.log(colors.dim + 'To configure:' + colors.reset);
    console.log('  1. Go to EN Dashboard → Hello → Account Settings → Tokens');
    console.log('  2. Copy your Public API token');
    console.log('  3. Add to .env.local: EN_PUBLIC_TOKEN="your-token"');
    console.log('');
    process.exit(1);
  }

  const token = process.env.EN_PUBLIC_TOKEN!;
  const region = (process.env.EN_REGION as 'us' | 'ca') || 'ca';

  log(colors.blue, '🔧 Config:', `Region: ${region.toUpperCase()}`);
  log(colors.dim, '   Token:', `${token.substring(0, 8)}...${token.substring(token.length - 4)}`);
  console.log('');

  // Create client
  const client = new ENPublicClient({ token, region });
  const prisma = new PrismaClient();

  try {
    separator();

    // Step 1: Test connection
    const connected = await testConnection(client);
    if (!connected) {
      process.exit(1);
    }

    console.log('');

    // Step 2: Handle different modes
    if (args.all) {
      // Test all pages with campaign IDs
      separator();
      log(colors.bright, '📋 Mode:', 'Testing all pages with campaign IDs');
      console.log('');

      const pages = await prisma.fundraisingPage.findMany({
        where: {
          campaignId: { not: null },
          status: 'ACTIVE',
        },
        orderBy: { name: 'asc' },
      });

      if (pages.length === 0) {
        log(colors.yellow, '⚠️  Warning:', 'No pages found with campaign IDs');
      } else {
        log(colors.blue, '📄 Found:', `${pages.length} pages with campaign IDs`);
        console.log('');

        let successCount = 0;
        let failCount = 0;
        let savedCount = 0;

        for (const page of pages) {
          separator();
          log(colors.bright, '📄 Page:', page.name);
          log(colors.dim, '   Campaign:', page.campaignId!.toString());

          const result = await fetchAndDisplayData(client, page.campaignId!, page.id);

          if (result.success && result.data) {
            successCount++;

            if (args.save) {
              console.log('');
              const saved = await saveToDatabase(prisma, page.id, result.data);
              if (saved) savedCount++;
            }
          } else if (!result.success) {
            failCount++;
          }

          console.log('');
          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // Summary
        separator();
        console.log(colors.bright + '\n📊 Summary\n' + colors.reset);
        log(colors.blue, '  Total Pages:', pages.length.toString());
        log(colors.green, '  Successful:', successCount.toString());
        if (failCount > 0) {
          log(colors.red, '  Failed:', failCount.toString());
        }
        if (args.save) {
          log(colors.green, '  Saved:', savedCount.toString());
        }
      }
    } else if (args.pageId) {
      // Test specific page
      separator();
      log(colors.bright, '📋 Mode:', 'Testing specific page');
      console.log('');

      const page = await prisma.fundraisingPage.findUnique({
        where: { id: args.pageId },
      });

      if (!page) {
        log(colors.red, '❌ Error:', `Page not found: ${args.pageId}`);
        process.exit(1);
      }

      if (!page.campaignId) {
        log(colors.red, '❌ Error:', 'Page does not have a campaign ID');
        console.log(colors.dim + '  Sync the page from EN to get campaign metadata' + colors.reset);
        process.exit(1);
      }

      log(colors.blue, '📄 Page:', page.name);
      log(colors.dim, '   Campaign:', page.campaignId.toString());
      console.log('');

      const result = await fetchAndDisplayData(client, page.campaignId, page.id);

      if (result.success && result.data && args.save) {
        console.log('');
        await saveToDatabase(prisma, page.id, result.data);
      }
    } else if (args.campaignId) {
      // Test specific campaign
      separator();
      log(colors.bright, '📋 Mode:', 'Testing specific campaign');
      console.log('');

      await fetchAndDisplayData(client, args.campaignId);

      if (args.save) {
        log(colors.yellow, '⚠️  Note:', 'Use --page to save data (need page ID for database)');
      }
    } else {
      // Connection test only - show some guidance
      separator();
      console.log(colors.bright + '\n💡 Next Steps\n' + colors.reset);
      console.log('  Connection test passed! To fetch data, use one of:');
      console.log('');
      console.log(colors.dim + '  # Fetch data for a specific campaign:' + colors.reset);
      console.log('  npx tsx src/scripts/test-netdonor.ts --campaign 12345');
      console.log('');
      console.log(colors.dim + '  # Fetch and save data for a page:' + colors.reset);
      console.log('  npx tsx src/scripts/test-netdonor.ts --page <pageId> --save');
      console.log('');
      console.log(colors.dim + '  # Test all pages:' + colors.reset);
      console.log('  npx tsx src/scripts/test-netdonor.ts --all');
    }

    separator();
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(colors.red + '\n❌ Fatal error:' + colors.reset, error);
  process.exit(1);
});
