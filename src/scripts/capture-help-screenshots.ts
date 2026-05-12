/**
 * Capture screenshots for the help system.
 *
 * Usage:
 *   npx tsx src/scripts/capture-help-screenshots.ts
 *   npx tsx src/scripts/capture-help-screenshots.ts --headed
 *   npx tsx src/scripts/capture-help-screenshots.ts --base-url http://localhost:3000 --page-id 1
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name: string, defaultValue: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}
const headed = args.includes('--headed');
const baseUrl = getArg('base-url', 'http://localhost:3000');
const pageId = getArg('page-id', '1');

const outputDir = path.resolve(process.cwd(), 'public/help/screenshots');

interface ScreenshotTask {
  key: string;
  url: string;
  tabClick?: string; // CSS selector for a tab to click before screenshot
}

const tasks: ScreenshotTask[] = [
  { key: 'dashboard', url: '/' },
  { key: 'page-detail-metrics', url: `/pages/${pageId}?tab=metrics` },
  { key: 'page-detail-content', url: `/pages/${pageId}?tab=content` },
  {
    key: 'page-detail-recommendations-generate',
    url: `/pages/${pageId}?tab=recommendations`,
  },
  {
    key: 'page-detail-recommendations-explore',
    url: `/pages/${pageId}?tab=recommendations&mode=explore`,
  },
  {
    key: 'page-detail-recommendations-chat',
    url: `/pages/${pageId}?tab=recommendations&mode=chat`,
  },
  { key: 'settings-connections', url: '/settings' },
  {
    key: 'settings-sync',
    url: '/settings',
    tabClick: '[role="tablist"] button:nth-child(2)',
  },
  {
    key: 'settings-ai',
    url: '/settings',
    tabClick: '[role="tablist"] button:nth-child(3)',
  },
  {
    key: 'settings-database',
    url: '/settings',
    tabClick: '[role="tablist"] button:nth-child(4)',
  },
];

async function scrubDOM(page: import('playwright').Page) {
  await page.evaluate(() => {
    // Replace email patterns
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && emailRegex.test(node.textContent)) {
        node.textContent = node.textContent.replace(emailRegex, 'user@example.org');
      }
    }

    // Replace org-like text in sidebar user section
    const userLabels = document.querySelectorAll('[class*="sidebar"] p, [class*="Sidebar"] p');
    userLabels.forEach((el) => {
      const text = el.textContent || '';
      if (text && !text.includes('@') && text.length > 3 && text.length < 40) {
        el.textContent = 'Example Organization';
      }
    });

    // Replace page names in table cells, card titles, breadcrumbs with generic names
    const genericNames = [
      'Spring Fundraiser 2026',
      'Emergency Relief Appeal',
      'Monthly Giving Program',
      'Year-End Campaign',
      'Climate Action Fund',
      'Education for All',
      'Community Health Drive',
      'Wildlife Conservation',
      'Hunger Relief Program',
      'Clean Water Initiative',
    ];

    // Table cells that look like page names (td in first or second column)
    const tableRows = document.querySelectorAll('table tbody tr');
    tableRows.forEach((row, idx) => {
      const cells = row.querySelectorAll('td');
      if (cells.length > 1) {
        const nameCell = cells[0];
        if (nameCell.textContent && nameCell.textContent.trim().length > 5) {
          nameCell.textContent = genericNames[idx % genericNames.length];
        }
      }
    });

    // Breadcrumb current page name
    const breadcrumbs = document.querySelectorAll('nav span');
    breadcrumbs.forEach((span, _idx) => {
      const text = span.textContent?.trim() || '';
      if (text.length > 5 && text !== 'Dashboard' && text !== '/') {
        span.textContent = genericNames[0];
      }
    });
  });
}

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Launching browser (${headed ? 'headed' : 'headless'})...`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Page ID: ${pageId}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  for (const task of tasks) {
    const fullUrl = `${baseUrl}${task.url}`;
    console.log(`Capturing: ${task.key} (${fullUrl})`);

    try {
      await page.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000); // let client-side hydration settle

      // Click tab if needed (for settings sub-tabs)
      if (task.tabClick) {
        await page.click(task.tabClick);
        await page.waitForTimeout(500);
      }

      // Wait for content to settle
      await page.waitForTimeout(1000);

      // Scrub sensitive data
      await scrubDOM(page);

      // Capture screenshot
      const filePath = path.join(outputDir, `${task.key}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`  Saved: ${filePath}`);
    } catch (err) {
      console.error(`  ERROR capturing ${task.key}:`, err instanceof Error ? err.message : err);
    }
  }

  await browser.close();
  console.log('\nDone! Screenshots saved to:', outputDir);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
