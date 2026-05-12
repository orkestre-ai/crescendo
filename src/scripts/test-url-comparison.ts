/**
 * Compare scraping the EN admin URL vs the public URL returned by EN.
 *
 * Decides whether the sync code in src/lib/jobs/phases/sync.ts can stop
 * constructing `https://{region}.engagingnetworks.app/page/{id}/donate/1`
 * and start using `enPage.url` from the EN list endpoint instead.
 *
 * Usage:
 *   npx tsx src/scripts/test-url-comparison.ts                  # 5 live pages
 *   npx tsx src/scripts/test-url-comparison.ts --limit 10
 *   npx tsx src/scripts/test-url-comparison.ts --pageId 12345
 *
 * Exit codes: 0 = PARITY, 1 = BROKEN (public URL fails where admin works),
 * 2 = DIFFERENT (both work but content diverges — manual review needed).
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// All app modules loaded via dynamic import below — static `import` would hoist
// above dotenv.config() and trip env validation before .env.local is read.
type PageContent = import('@/types').PageContent;

// EN list endpoint actually returns (per /page response inspection):
//   id, campaignId, name, title, type, subType, campaignBaseUrl, campaignStatus, ...
// The `url` field documented in the EN API does NOT come back. The public URL
// is constructed as `${campaignBaseUrl}/page/${id}/donate/1` — same path shape
// as the EN admin URL, different hostname.
interface ENListRow {
  id: number | string;
  name: string;
  campaignBaseUrl?: string;
  campaignStatus?: string;
}

interface CliArgs {
  limit: number;
  pageId: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit = 5;
  let pageId: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number(args[++i]);
    } else if (args[i] === '--pageId' && args[i + 1]) {
      pageId = args[++i];
    }
  }
  return { limit, pageId };
}

type Outcome =
  | { kind: 'success'; content: PageContent; ms: number; viaPlaywright: boolean }
  | { kind: 'error'; error: string; ms: number };

async function scrapeOne(
  scraper: typeof import('@/lib/scraper').scraper,
  url: string
): Promise<Outcome> {
  const start = Date.now();
  try {
    const content = await scraper.scrapePage(url, { timeoutMs: 30000 });
    return {
      kind: 'success',
      content,
      ms: Date.now() - start,
      viaPlaywright: content.usedPlaywright === true,
    };
  } catch (err) {
    const message = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
    return { kind: 'error', error: message, ms: Date.now() - start };
  }
}

function fingerprint(c: PageContent) {
  return {
    h1: c.h1?.slice(0, 80) ?? null,
    metaTitle: c.metaTitle?.slice(0, 80) ?? null,
    ctaCount: c.cta.length,
    amounts: [...c.donationAmounts].sort((a, b) => a - b),
    currency: c.currency ?? null,
    minDonation: c.minDonationAmount ?? null,
    feeCover: c.hasFeeCover === true,
    monthly: c.hasMonthlyGiving === true,
  };
}

function fingerprintsMatch(a: ReturnType<typeof fingerprint>, b: ReturnType<typeof fingerprint>) {
  if (a.h1 !== b.h1) return false;
  if (a.ctaCount !== b.ctaCount) return false;
  if (a.amounts.length !== b.amounts.length) return false;
  if (a.amounts.some((v, i) => v !== b.amounts[i])) return false;
  if (a.currency !== b.currency) return false;
  if (a.feeCover !== b.feeCover) return false;
  if (a.monthly !== b.monthly) return false;
  return true;
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  const { limit, pageId } = parseArgs();

  // Dynamic imports — must run after dotenv.config() above.
  const { enClient } = await import('@/lib/engaging-networks');
  const { scraper } = await import('@/lib/scraper');
  const { closeBrowser } = await import('@/lib/playwright-scraper');
  const { env } = await import('@/config/env');

  console.log('Fetching pages from EN...');
  let pages: ENListRow[];
  if (pageId) {
    const detail = await enClient.getPage(pageId);
    pages = [
      {
        id: detail.id,
        name: detail.name,
        campaignBaseUrl: detail.campaignBaseUrl,
        campaignStatus: detail.campaignStatus,
      },
    ];
  } else {
    // EN list endpoint doesn't return status, so we fetch many and filter
    // client-side by campaignStatus === 'live' (the field that IS returned).
    const all = (await enClient.getPages({
      type: 'nd',
      status: '',
      limit: 200,
    })) as unknown as ENListRow[];
    pages = all
      .filter(
        (p) =>
          p.campaignStatus?.toLowerCase() === 'live' &&
          p.campaignBaseUrl &&
          p.campaignBaseUrl.startsWith('http')
      )
      .slice(0, limit);
  }

  if (pages.length === 0) {
    console.log('No pages to test. Exiting.');
    process.exit(0);
  }

  console.log(`Testing ${pages.length} page(s). Region: ${env.EN_REGION}\n`);

  const adminHost = `${env.EN_REGION}.engagingnetworks.app`;
  const trustedHosts = new Set<string>([adminHost]);
  for (const p of pages) {
    if (!p.campaignBaseUrl) continue;
    try {
      trustedHosts.add(new URL(p.campaignBaseUrl).hostname);
    } catch {
      // skip malformed
    }
  }
  scraper.setTrustedHosts(trustedHosts);

  type Row = {
    pageId: string;
    name: string;
    adminUrl: string;
    publicUrl: string;
    admin: Outcome;
    public: Outcome;
    match: boolean | null;
  };

  const rows: Row[] = [];

  for (const p of pages) {
    const adminUrl = `https://${adminHost}/page/${p.id}/donate/1?mode=DEMO`;
    const publicUrl = `${p.campaignBaseUrl}/page/${p.id}/donate/1?mode=DEMO`;

    process.stdout.write(`[${p.id}] ${p.name}\n`);
    process.stdout.write(`  admin  : ${adminUrl}\n`);
    process.stdout.write(`  public : ${publicUrl}\n`);

    const admin = await scrapeOne(scraper, adminUrl);
    process.stdout.write(`  admin  → ${admin.kind} (${admin.ms}ms${admin.kind === 'success' && admin.viaPlaywright ? ', playwright' : ''})\n`);

    const pub = await scrapeOne(scraper, publicUrl);
    process.stdout.write(`  public → ${pub.kind} (${pub.ms}ms${pub.kind === 'success' && pub.viaPlaywright ? ', playwright' : ''})\n`);

    let match: boolean | null = null;
    if (admin.kind === 'success' && pub.kind === 'success') {
      const fa = fingerprint(admin.content);
      const fp = fingerprint(pub.content);
      match = fingerprintsMatch(fa, fp);
      if (!match) {
        console.log('  fingerprint diff:');
        console.log('    admin :', JSON.stringify(fa));
        console.log('    public:', JSON.stringify(fp));
      } else {
        console.log(`  fingerprint match (h1="${fa.h1 ?? ''}", ${fa.amounts.length} amounts, ${fa.ctaCount} CTAs)`);
      }
    } else if (admin.kind === 'error') {
      console.log(`  admin error : ${admin.error}`);
    }
    if (pub.kind === 'error') {
      console.log(`  public error: ${pub.error}`);
    }

    rows.push({
      pageId: String(p.id),
      name: p.name,
      adminUrl,
      publicUrl,
      admin,
      public: pub,
      match,
    });
    console.log('');
  }

  // Summary table
  console.log('─'.repeat(100));
  console.log(pad('Page ID', 10), pad('Name', 40), pad('Admin', 12), pad('Public', 12), 'Match');
  console.log('─'.repeat(100));
  for (const r of rows) {
    console.log(
      pad(r.pageId, 10),
      pad(r.name.slice(0, 38), 40),
      pad(r.admin.kind === 'success' ? 'OK' : 'FAIL', 12),
      pad(r.public.kind === 'success' ? 'OK' : 'FAIL', 12),
      r.match === null ? '-' : r.match ? '✓' : '✗'
    );
  }
  console.log('─'.repeat(100));

  // Verdict
  const total = rows.length;
  const bothOk = rows.filter((r) => r.admin.kind === 'success' && r.public.kind === 'success').length;
  const publicBroken = rows.filter(
    (r) => r.admin.kind === 'success' && r.public.kind === 'error'
  ).length;
  const differentContent = rows.filter((r) => r.match === false).length;
  const allMatchedWhereBothOk = bothOk > 0 && differentContent === 0;

  console.log(`\nSummary: ${bothOk}/${total} both succeeded, ${publicBroken} public-only failures, ${differentContent} content mismatches.\n`);

  let verdict: 'PARITY' | 'DIFFERENT' | 'BROKEN';
  if (publicBroken > 0) {
    verdict = 'BROKEN';
  } else if (!allMatchedWhereBothOk) {
    verdict = 'DIFFERENT';
  } else {
    verdict = 'PARITY';
  }

  const verdictMessage: Record<typeof verdict, string> = {
    PARITY:
      '✅ PARITY — public URL works and produces matching content. Safe to switch sync to enPage.url.',
    DIFFERENT:
      '⚠️  DIFFERENT — both URLs work but content diverges. Manual review required before switching.',
    BROKEN:
      '❌ BROKEN — public URL fails where admin URL succeeds. Use split-field design (separate publicUrl).',
  };
  console.log(verdictMessage[verdict]);

  await closeBrowser();
  process.exit(verdict === 'PARITY' ? 0 : verdict === 'DIFFERENT' ? 2 : 1);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  try {
    const { closeBrowser } = await import('@/lib/playwright-scraper');
    await closeBrowser();
  } catch {
    // best-effort cleanup
  }
  process.exit(3);
});
