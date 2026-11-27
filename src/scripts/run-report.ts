/**
 * Run a report from the command line.
 *
 * Starts a run against the configured database, GA4 property and Reports
 * model, prints its activity as it happens, then prints the ledger with each
 * figure's recheck status. Exits non-zero unless the run ends COMPLETED.
 *
 * This makes real, paid AI calls and reads the real GA4 property.
 *
 * Usage:
 *   npx tsx src/scripts/run-report.ts --definition smoke-test
 *   npx tsx src/scripts/run-report.ts --definition <key> --input name=value --input other=value
 *   npx tsx src/scripts/run-report.ts --prompt-file path/to/prompt.md
 *
 * A prompt file runs as a one-off definition with the ga4_report and
 * ga4_funnel tools and the default guards (500 steps, 120 minutes).
 */

// Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const USAGE = `Usage:
  npx tsx src/scripts/run-report.ts --definition <key> [--input name=value ...]
  npx tsx src/scripts/run-report.ts --prompt-file <path> [--input name=value ...]`;

function parseArgs(argv: string[]) {
  let definitionKey: string | undefined;
  let promptFile: string | undefined;
  const inputs: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === '--definition' && value) {
      definitionKey = value;
      i++;
    } else if (argv[i] === '--prompt-file' && value) {
      promptFile = value;
      i++;
    } else if (argv[i] === '--input' && value?.includes('=')) {
      const at = value.indexOf('=');
      inputs[value.slice(0, at)] = value.slice(at + 1);
      i++;
    } else {
      throw new Error(`Cannot read the argument "${argv[i]}".\n${USAGE}`);
    }
  }
  if (Boolean(definitionKey) === Boolean(promptFile)) {
    throw new Error(`Give one of --definition or --prompt-file.\n${USAGE}`);
  }
  return { definitionKey, promptFile, inputs };
}

async function main(): Promise<number> {
  const { definitionKey, promptFile, inputs } = parseArgs(process.argv.slice(2));

  // Dynamic imports — must run after dotenv.config() above.
  const { ensureDefaultReportDefinitions } = await import('../lib/reports/definitions');
  const { prismaStore: store } = await import('../lib/reports/store');
  const { runReport, startReportRun } = await import('../lib/reports/runner');

  let start: Parameters<typeof startReportRun>[0];
  if (definitionKey) {
    await ensureDefaultReportDefinitions();
    const definition = await store.findDefinition({ key: definitionKey });
    if (!definition) throw new Error(`No report definition with key "${definitionKey}".`);
    start = { definitionId: definition.id, inputs };
  } else {
    start = {
      definition: {
        key: 'prompt-file',
        name: path.basename(promptFile!),
        prompt: fs.readFileSync(path.resolve(promptFile!), 'utf8'),
        enabledTools: ['ga4_report', 'ga4_funnel'],
        maxSteps: 500,
        maxMinutes: 120,
      },
      inputs,
    };
  }

  const { runId } = await startReportRun(start);
  console.log(`Run ${runId} started\n`);

  // Ctrl-C asks the run to cancel, so it is not left blocking the next one.
  process.on('SIGINT', () => {
    console.log('\nCancelling...');
    void store.updateRun(runId, { cancelRequested: true });
  });

  // Print events as they arrive, while the run goes on.
  let seen = 0;
  const printNew = async () => {
    for (const event of await store.listEvents(runId, seen)) {
      seen = event.seq;
      console.log(`[${String(event.seq).padStart(3)}] ${event.type.padEnd(10)} ${event.message}`);
    }
  };
  let running = true;
  const run = runReport(runId).finally(() => {
    running = false;
  });
  while (running) {
    await printNew();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await run;
  await printNew();

  const finished = await store.getRun(runId);
  const figures = await store.listFigures(runId);
  const datasets = await store.listDatasets(runId);
  const queries = await store.listQueries(runId);

  console.log('\nLedger');
  if (figures.length === 0) console.log('  (no figures)');
  for (const figure of figures) {
    const previous =
      figure.recheckStatus === 'corrected' ? ` (first run: ${figure.previousValue})` : '';
    console.log(
      `  ${figure.key.padEnd(24)} ${figure.display.padStart(14)}  ${figure.recheckStatus.padEnd(9)} ${figure.label}${previous}`
    );
  }
  for (const dataset of datasets) {
    console.log(
      `  ${dataset.key.padEnd(24)} ${`${dataset.rows.length} rows`.padStart(14)}  dataset   ${dataset.label}`
    );
  }

  console.log('\nQueries');
  for (const query of queries) {
    const recheck = !query.recheck
      ? 'not rechecked'
      : query.recheck.error
        ? `recheck failed: ${query.recheck.error}`
        : query.recheck.matched
          ? 'recheck matched'
          : 'recheck differed';
    console.log(`  ${query.key.padEnd(5)} ${query.tool}, ${query.rowCount} rows, ${recheck}`);
  }

  const usage = finished?.usage;
  console.log(
    `\nSteps: ${finished?.stepCount ?? 0}. Tokens: ${usage?.inputTokens ?? 0} input, ${usage?.cachedInputTokens ?? 0} cached input, ${usage?.outputTokens ?? 0} output.`
  );
  console.log(`Time zone: ${finished?.timeZone}, currency: ${finished?.currencyCode}`);
  for (const warning of finished?.warnings ?? []) console.log(`Warning: ${warning.message}`);
  console.log(
    `\nStatus: ${finished?.status}${finished?.statusReason ? ` (${finished.statusReason})` : ''}`
  );

  return finished?.status === 'COMPLETED' ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
