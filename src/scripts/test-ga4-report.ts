/**
 * Test Script: GA4 report and funnel tools
 *
 * Runs the ga4_report and ga4_funnel tools against the configured GA4
 * property and checks the shape of what comes back:
 * 1. A sorted report with a contains filter and limit 250
 * 2. A report over two date ranges
 * 3. A funnel with two steps
 * 4. A relative date, which must be rejected with the property's current date
 *
 * Reads only. Costs a few GA4 quota tokens. Exits non-zero if a call fails
 * or a result is missing a field.
 *
 * Usage:
 *   npx tsx src/scripts/test-ga4-report.ts
 */

// Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const REPORT_FIELDS = [
  'headers',
  'rows',
  'totalRows',
  'truncated',
  'sampled',
  'samplingNote',
  'thresholded',
  'otherRow',
  'timeZone',
  'currencyCode',
  'redactedEmails',
];
const FUNNEL_FIELDS = ['headers', 'rows', 'sampled', 'samplingNote', 'redactedEmails'];

// The part of a page address that marks an Engaging Networks page.
const PATH_NEEDLE = '/page/';

let failures = 0;

function check(ok: boolean, message: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures++;
}

function checkFields(result: object, fields: string[]) {
  const record = result as Record<string, unknown>;
  const missing = fields.filter((field) => record[field] === undefined);
  check(
    missing.length === 0,
    `every field is present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`
  );
}

/** A date `daysAgo` days before today (UTC), as YYYY-MM-DD. */
function day(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  // Dynamic imports — must run after dotenv.config() above.
  const { runGa4Report } = await import('../lib/ai-tools/ga4-report');
  const { runGa4Funnel } = await import('../lib/ai-tools/ga4-funnel');

  // 28 full days ending two days ago, and the 28 days before them.
  const current = { startDate: day(29), endDate: day(2) };
  const previous = { startDate: day(57), endDate: day(30) };

  console.log(`\n1. Sorted report, pagePath contains "${PATH_NEEDLE}", limit 250`);
  const sorted = await runGa4Report({
    dimensions: ['pagePath'],
    metrics: ['screenPageViews', 'sessions'],
    dateRanges: [current],
    dimensionFilter: { field: 'pagePath', match: 'contains', value: PATH_NEEDLE },
    metricFilter: { field: 'screenPageViews', op: '>=', number: 1 },
    orderBys: [{ field: 'screenPageViews', desc: true }],
    limit: 250,
  });
  console.log(
    `  rows: ${sorted.rows.length} of ${sorted.totalRows} (truncated: ${sorted.truncated}), sampled: ${sorted.sampled}, time zone: ${sorted.timeZone}, currency: ${sorted.currencyCode}, emails removed: ${sorted.redactedEmails}`
  );
  checkFields(sorted, REPORT_FIELDS);
  check(sorted.rows.length > 0 && sorted.rows.length <= 250, 'between 1 and 250 rows');
  check(
    sorted.rows.every((row) => row.pagePath.toLowerCase().includes(PATH_NEEDLE)),
    'every row matches the filter'
  );
  const views = sorted.rows.map((row) => Number(row.screenPageViews));
  check(
    views.every((value, i) => i === 0 || views[i - 1] >= value),
    'rows are sorted by screenPageViews, largest first'
  );
  check(
    sorted.truncated === sorted.totalRows > sorted.rows.length,
    'truncated agrees with totalRows'
  );
  check(sorted.timeZone !== '' && sorted.currencyCode !== '', 'time zone and currency are set');

  console.log('\n2. Two date ranges');
  const compared = await runGa4Report({
    dimensions: ['deviceCategory'],
    metrics: ['sessions', 'totalUsers'],
    dateRanges: [
      { ...current, name: 'current' },
      { ...previous, name: 'previous' },
    ],
    orderBys: [{ field: 'sessions', desc: true }],
  });
  console.log(
    `  rows: ${compared.rows.length} (${compared.totalRows} per range, truncated: ${compared.truncated}), sampled: ${compared.sampled}, time zone: ${compared.timeZone}, currency: ${compared.currencyCode}`
  );
  checkFields(compared, REPORT_FIELDS);
  check(compared.headers.includes('dateRange'), 'a dateRange column tells the two ranges apart');
  const ranges = new Set(compared.rows.map((row) => row.dateRange));
  check(ranges.has('current') && ranges.has('previous'), 'rows came back for both ranges');
  check(!compared.truncated, 'a short list over two ranges is not called truncated');

  console.log('\n3. Funnel with two steps');
  const funnel = await runGa4Funnel({
    steps: [
      {
        name: 'Viewed a page',
        eventName: 'page_view',
        params: [{ name: 'page_location', match: 'contains', value: PATH_NEEDLE }],
      },
      { name: 'Donated', eventName: 'purchase' },
    ],
    dateRange: current,
  });
  console.log(`  rows: ${funnel.rows.length}, sampled: ${funnel.sampled}`);
  for (const row of funnel.rows) console.log(`  ${JSON.stringify(row)}`);
  checkFields(funnel, FUNNEL_FIELDS);
  check(funnel.headers.includes('funnelStepName'), 'the funnel has a step name column');
  check(funnel.headers.includes('activeUsers'), 'the funnel counts people per step');
  check(funnel.rows.length >= 1, 'at least one step came back');

  console.log('\n4. A relative date is rejected');
  try {
    await runGa4Report({
      dimensions: [],
      metrics: ['sessions'],
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    });
    check(false, 'the report should have been rejected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ${message}`);
    check(
      /Today is \d{4}-\d{2}-\d{2}/.test(message),
      "the message names the property's current date"
    );
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nGA4 call failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
