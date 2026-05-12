#!/usr/bin/env node

/**
 * Test Script: Page Content Scraper
 *
 * Tests the page scraping functionality against real EN pages
 * to validate and refine our extraction logic.
 *
 * Usage:
 *   node scripts/test-scraper.js                    # Test first 3 pages
 *   node scripts/test-scraper.js --all              # Test all active pages
 *   node scripts/test-scraper.js --id <pageId>      # Test specific page by DB ID
 *   node scripts/test-scraper.js --enId <enPageId>  # Test specific page by EN ID
 *   node scripts/test-scraper.js --closed           # Test only closed pages
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const prisma = new PrismaClient();

// Color codes for terminal output
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

function log(color, label, message) {
  console.log(`${color}${label}${colors.reset} ${message}`);
}

function getScrapableUrl(page) {
  const isLive = page.campaignStatus?.toLowerCase() === 'open';
  const url = isLive ? page.url : `${page.url}?mode=DEMO`;
  return { url, isLive };
}

async function scrapePage(url) {
  const startTime = Date.now();

  try {
    log(colors.cyan, '🌐 Fetching:', url);

    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FundraisingOptimizer/1.0)',
      },
      timeout: 15000,
    });

    const duration = Date.now() - startTime;
    log(colors.green, '✅ Fetched:', `${duration}ms - ${(html.length / 1024).toFixed(2)} KB`);

    const $ = cheerio.load(html);

    // Extract H1 (first one found)
    const h1 = $('h1').first().text().trim() || null;

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;

    // Extract CTA buttons (common patterns)
    const ctaButtons = [];
    const ctaSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'a.donate-button',
      'a.cta-button',
      '.en__submit button',
      '.en__submit input',
      'button.btn-primary',
      'button.btn-donate',
    ];

    $(ctaSelectors.join(', ')).each((_, el) => {
      const text = $(el).text().trim() || $(el).attr('value')?.trim();
      if (text && text.length > 0 && text.length < 100) {
        ctaButtons.push(text);
      }
    });

    // Extract donation amounts (Engaging Networks patterns)
    const donationAmounts = [];
    const amountSelectors = [
      'input[name="transaction.donationAmt"]',
      '.en__field__item--donationAmt input',
      '.donation-amount',
      '.amount-option',
      '[data-amount]',
      'input[type="radio"][name*="amount"]',
    ];

    $(amountSelectors.join(', ')).each((_, el) => {
      const $el = $(el);
      const value = $el.attr('value') || $el.data('amount') || $el.text();
      const amount = parseFloat(String(value).replace(/[^0-9.]/g, ''));
      if (!isNaN(amount) && amount > 0) {
        donationAmounts.push(amount);
      }
    });

    // Additional pattern: Look for text like "$50", "$100" etc
    const bodyText = $('body').text();
    const amountMatches = bodyText.match(/\$\s*(\d+(?:\.\d{2})?)/g);
    if (amountMatches) {
      amountMatches.forEach((match) => {
        const amount = parseFloat(match.replace(/[^0-9.]/g, ''));
        if (!isNaN(amount) && amount > 0 && amount <= 10000) {
          donationAmounts.push(amount);
        }
      });
    }

    // Count various elements for debugging
    const elementCounts = {
      h1: $('h1').length,
      h2: $('h2').length,
      buttons: $('button').length,
      inputs: $('input').length,
      forms: $('form').length,
      links: $('a').length,
    };

    return {
      success: true,
      duration,
      htmlSize: html.length,
      data: {
        h1,
        metaDescription,
        ctaButtons: [...new Set(ctaButtons)],
        donationAmounts: [...new Set(donationAmounts)].sort((a, b) => a - b),
        scrapedAt: new Date().toISOString(),
      },
      debug: {
        elementCounts,
        hasEnClass: html.includes('en__'),
        hasReactRoot: html.includes('__NEXT_DATA__') || html.includes('react-root'),
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration,
      error: error.message,
      errorCode: error.code,
      errorStatus: error.response?.status,
    };
  }
}

function displayResults(page, result) {
  console.log('\n' + '='.repeat(80));
  log(colors.bright, '📄 Page:', page.name);
  log(colors.dim, '   EN ID:', page.enPageId);
  log(colors.dim, '   Status:', `${page.campaignStatus || 'unknown'} (${page.status})`);

  const { url, isLive } = getScrapableUrl(page);
  log(colors.dim, '   URL:', url);
  if (!isLive) {
    log(colors.yellow, '   ⚠️  Note:', 'Using ?mode=DEMO (page not live)');
  }

  if (!result.success) {
    console.log('');
    log(colors.red, '❌ FAILED:', result.error);
    if (result.errorStatus) {
      log(colors.red, '   HTTP Status:', result.errorStatus);
    }
    if (result.errorCode) {
      log(colors.red, '   Error Code:', result.errorCode);
    }
    return;
  }

  console.log('');
  log(colors.green, '✅ Success', `(${result.duration}ms)`);

  console.log('\n' + colors.bright + '📊 Extracted Data:' + colors.reset);

  // H1
  if (result.data.h1) {
    log(colors.green, '  ✓ H1:', `"${result.data.h1}"`);
  } else {
    log(colors.yellow, '  ⚠️  H1:', 'Not found');
  }

  // Meta Description
  if (result.data.metaDescription) {
    const preview =
      result.data.metaDescription.length > 60
        ? result.data.metaDescription.substring(0, 60) + '...'
        : result.data.metaDescription;
    log(colors.green, '  ✓ Meta:', `"${preview}"`);
  } else {
    log(colors.yellow, '  ⚠️  Meta:', 'Not found');
  }

  // CTA Buttons
  if (result.data.ctaButtons.length > 0) {
    log(colors.green, `  ✓ CTAs:`, `Found ${result.data.ctaButtons.length}`);
    result.data.ctaButtons.forEach((cta) => {
      console.log(`    ${colors.dim}→${colors.reset} "${cta}"`);
    });
  } else {
    log(colors.yellow, '  ⚠️  CTAs:', 'None found');
  }

  // Donation Amounts
  if (result.data.donationAmounts.length > 0) {
    log(colors.green, `  ✓ Amounts:`, `Found ${result.data.donationAmounts.length}`);
    const formatted = result.data.donationAmounts.map((amt) => `$${amt.toFixed(2)}`).join(', ');
    console.log(`    ${colors.dim}→${colors.reset} ${formatted}`);
  } else {
    log(colors.yellow, '  ⚠️  Amounts:', 'None found');
  }

  // Debug info
  console.log('\n' + colors.dim + '🔍 Debug Info:' + colors.reset);
  console.log(
    `    Elements: ${result.debug.elementCounts.h1} h1, ${result.debug.elementCounts.h2} h2, ${result.debug.elementCounts.buttons} buttons, ${result.debug.elementCounts.inputs} inputs`
  );
  console.log(`    EN Classes: ${result.debug.hasEnClass ? 'Yes' : 'No'}`);
  console.log(`    React/Next: ${result.debug.hasReactRoot ? 'Yes' : 'No'}`);
  console.log(`    HTML Size: ${(result.htmlSize / 1024).toFixed(2)} KB`);
}

async function main() {
  const args = process.argv.slice(2);

  console.log(colors.bright + '\n🧪 Page Content Scraper Test\n' + colors.reset);

  let pages = [];

  // Parse arguments
  if (args.includes('--id')) {
    const idIndex = args.indexOf('--id');
    const id = args[idIndex + 1];
    const page = await prisma.fundraisingPage.findUnique({ where: { id } });
    if (!page) {
      console.error(colors.red + `❌ Page not found with ID: ${id}` + colors.reset);
      process.exit(1);
    }
    pages = [page];
  } else if (args.includes('--enId')) {
    const enIdIndex = args.indexOf('--enId');
    const enPageId = args[enIdIndex + 1];
    const page = await prisma.fundraisingPage.findUnique({ where: { enPageId } });
    if (!page) {
      console.error(colors.red + `❌ Page not found with EN ID: ${enPageId}` + colors.reset);
      process.exit(1);
    }
    pages = [page];
  } else if (args.includes('--closed')) {
    pages = await prisma.fundraisingPage.findMany({
      where: {
        status: 'ACTIVE',
        campaignStatus: { in: ['close', 'closed', 'Close', 'Closed'] },
      },
      take: 10,
    });
    log(colors.blue, '🔍 Testing:', `${pages.length} closed pages`);
  } else if (args.includes('--all')) {
    pages = await prisma.fundraisingPage.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { enPageId: 'asc' },
    });
    log(colors.blue, '🔍 Testing:', `All ${pages.length} active pages`);
  } else {
    // Default: test first 3 pages
    pages = await prisma.fundraisingPage.findMany({
      where: { status: 'ACTIVE' },
      take: 3,
      orderBy: { enPageId: 'asc' },
    });
    log(colors.blue, '🔍 Testing:', `First ${pages.length} pages (use --all for all pages)`);
  }

  if (pages.length === 0) {
    console.log(colors.yellow + '\n⚠️  No pages found to test' + colors.reset);
    await prisma.$disconnect();
    return;
  }

  // Test each page
  const results = {
    total: pages.length,
    successful: 0,
    failed: 0,
    withH1: 0,
    withMeta: 0,
    withCTA: 0,
    withAmounts: 0,
  };

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limiting
    }

    const { url } = getScrapableUrl(page);
    const result = await scrapePage(url);

    displayResults(page, result);

    if (result.success) {
      results.successful++;
      if (result.data.h1) results.withH1++;
      if (result.data.metaDescription) results.withMeta++;
      if (result.data.ctaButtons.length > 0) results.withCTA++;
      if (result.data.donationAmounts.length > 0) results.withAmounts++;
    } else {
      results.failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log(colors.bright + '\n📊 Test Summary\n' + colors.reset);

  log(colors.blue, '  Total Pages:', results.total);
  log(
    colors.green,
    '  Successful:',
    `${results.successful} (${((results.successful / results.total) * 100).toFixed(0)}%)`
  );
  if (results.failed > 0) {
    log(
      colors.red,
      '  Failed:',
      `${results.failed} (${((results.failed / results.total) * 100).toFixed(0)}%)`
    );
  }

  console.log('');
  log(
    colors.cyan,
    '  With H1:',
    `${results.withH1} / ${results.successful} (${((results.withH1 / results.successful) * 100).toFixed(0)}%)`
  );
  log(
    colors.cyan,
    '  With Meta:',
    `${results.withMeta} / ${results.successful} (${((results.withMeta / results.successful) * 100).toFixed(0)}%)`
  );
  log(
    colors.cyan,
    '  With CTA:',
    `${results.withCTA} / ${results.successful} (${((results.withCTA / results.successful) * 100).toFixed(0)}%)`
  );
  log(
    colors.cyan,
    '  With Amounts:',
    `${results.withAmounts} / ${results.successful} (${((results.withAmounts / results.successful) * 100).toFixed(0)}%)`
  );

  console.log('\n' + '='.repeat(80) + '\n');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(colors.red + '\n❌ Fatal error:' + colors.reset, error);
  process.exit(1);
});
