/**
 * Fill EnDailyGiving with daily Engaging Networks giving for a date range.
 *
 * Every donation page Crescendo knows, any status, is asked for the whole
 * range first; only pages with gifts in it are then asked day by day.
 * Running it again over the same days replaces them.
 *
 * This calls the real EN Public API, which only answers allow-listed IPs.
 * The production image has no tsx and no source; there, call
 * POST /api/cron/en-daily?from=...&to=... with the CRON_SECRET instead.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-en-daily.ts --from 2024-11-15 --to 2024-12-31
 *   npx tsx src/scripts/backfill-en-daily.ts --from 2025-12-02 --to 2025-12-02 --page 12345
 */

// Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const USAGE = `Usage:
  npx tsx src/scripts/backfill-en-daily.ts --from YYYY-MM-DD --to YYYY-MM-DD [--page <EN page id> ...]`;

function parseArgs(argv: string[]) {
  let from: string | undefined;
  let to: string | undefined;
  const pageIds: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === '--from' && value) from = value;
    else if (argv[i] === '--to' && value) to = value;
    else if (argv[i] === '--page' && value) pageIds.push(value);
    else throw new Error(`Cannot read the argument "${argv[i]}".\n${USAGE}`);
    i++;
  }
  if (!from || !to) throw new Error(`Give --from and --to.\n${USAGE}`);
  return { from, to, pageIds: pageIds.length ? pageIds : undefined };
}

async function main(): Promise<number> {
  const { from, to, pageIds } = parseArgs(process.argv.slice(2));

  // Dynamic imports — must run after dotenv.config() above.
  const { collectEnDaily, enDailyTotals } = await import('../lib/en-daily');

  const started = Date.now();
  const result = await collectEnDaily({ from, to, pageIds });
  const totals = await enDailyTotals(from, to, pageIds);

  console.log(`Range: ${from} to ${to}`);
  console.log(
    `Pages: ${result.pages} (${result.skippedPages} with nothing in the range). Calls: ${result.calls}. Days written: ${result.daysWritten}.`
  );
  console.log(
    `Stored total for the range: ${totals.totalAmount.toFixed(2)} from ${totals.donationCount} gifts (${totals.rows} rows).`
  );
  for (const error of result.errors) {
    console.log(
      `Error: page ${error.pageId}${error.date ? ` on ${error.date}` : ''}: ${error.message}`
    );
  }
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)}s.`);

  return result.errors.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
