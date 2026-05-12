#!/usr/bin/env npx tsx
/**
 * Journey Trace CLI — `npm run logs:trace`
 *
 * Navigate structured log journeys from dev-logs.json.
 *
 * Commands:
 *   npm run logs:trace -- job <jobId>           Trace a specific job
 *   npm run logs:trace -- chat <conversationId> Trace a chat session
 *   npm run logs:trace -- exploration <id>      Trace an exploration
 *   npm run logs:trace -- recent                All journeys in last hour
 *   npm run logs:trace -- errors                All errors in last 24h
 *   npm run logs:trace -- llm                   LLM calls with token usage
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const LOG_FILE = resolve(process.cwd(), 'logs/dev-logs.json');

interface LogEntry {
  level: number;
  time: string;
  msg: string;
  journey?: string;
  jobId?: string;
  conversationId?: string;
  explorationId?: string;
  event?: string;
  phase?: string;
  durationMs?: number;
  totalPages?: number;
  processed?: number;
  errors?: number;
  outputTokens?: number;
  inputTokens?: number;
  toolCallCount?: number;
  model?: string;
  err?: { message: string; stack?: string };
  [key: string]: unknown;
}

const LEVEL_NAMES: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const LEVEL_COLORS: Record<number, string> = {
  10: '\x1b[90m', // gray
  20: '\x1b[36m', // cyan
  30: '\x1b[32m', // green
  40: '\x1b[33m', // yellow
  50: '\x1b[31m', // red
  60: '\x1b[35m', // magenta
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function readLogs(): LogEntry[] {
  if (!existsSync(LOG_FILE)) {
    console.error(`Log file not found: ${LOG_FILE}`);
    console.error('Run the dev server first to generate logs.');
    process.exit(1);
  }

  const content = readFileSync(LOG_FILE, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as LogEntry[];
}

function formatTime(time: string): string {
  const d = new Date(time);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function colorLevel(level: number): string {
  const color = LEVEL_COLORS[level] || '';
  const name = LEVEL_NAMES[level] || `L${level}`;
  return `${color}${name}${RESET}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Commands ────────────────────────────────────────────────

function traceJob(jobId: string) {
  const logs = readLogs().filter((e) => e.jobId?.startsWith(jobId));

  if (logs.length === 0) {
    console.log(`No log entries found for job starting with "${jobId}"`);
    return;
  }

  const fullJobId = logs[0].jobId!;
  const jobType = (logs.find((e) => e.event?.includes('created'))?.msg || '').split(' ')[0] || 'SYNC';

  console.log(`\n${BOLD}═══ ${jobType} Job ${fullJobId.slice(0, 10)}... ═══${RESET}`);

  const created = logs.find((e) => e.event?.includes('created'));
  if (created) {
    console.log(`  Created: ${formatTime(created.time)}  Triggered by: ${created.triggeredBy || 'unknown'}  Pages: ${created.totalPages || '?'}`);
  }

  console.log('');

  // Group by phase
  const phaseStarts = logs.filter((e) => e.event?.includes('phase.started'));
  const phaseCompletes = logs.filter((e) => e.event?.includes('phase.completed'));
  const phaseSkips = logs.filter((e) => e.event?.includes('phase.skipped'));

  for (const start of phaseStarts) {
    const phase = start.phase || 'UNKNOWN';
    const complete = phaseCompletes.find((c) => c.phase === phase);
    const duration = complete?.durationMs ? formatDuration(complete.durationMs) : '...';
    const errors = complete?.errors || 0;
    const status = errors > 0 ? `\x1b[33m⚠ ${errors} errors${RESET}` : `\x1b[32m✓${RESET}`;

    console.log(`  ▸ ${BOLD}${phase}${RESET}${' '.repeat(Math.max(1, 30 - phase.length))}${duration.padStart(8)}    ${status}`);

    // Show page-level warnings for this phase
    const phaseWarnings = logs.filter(
      (e) => e.level >= 40 && e.phase === phase && !e.event?.includes('phase.')
    );
    for (const warn of phaseWarnings.slice(0, 5)) {
      console.log(`    ${LEVEL_COLORS[warn.level]}⚠${RESET} ${warn.msg}`);
    }
  }

  for (const skip of phaseSkips) {
    const phase = skip.phase || 'UNKNOWN';
    console.log(`  ${DIM}⊘ ${phase}${' '.repeat(Math.max(1, 30 - phase.length))}—       skipped (${skip.reason || 'disabled'})${RESET}`);
  }

  // Job completion
  const completed = logs.find((e) => e.event === 'job.completed' || e.event === 'job.completed_with_errors');
  const failed = logs.find((e) => e.event === 'job.failed');

  console.log('');
  if (completed) {
    const total = completed.durationMs ? formatDuration(completed.durationMs) : '?';
    const errCount = completed.errors || 0;
    console.log(`${BOLD}═══${' '.repeat(40)}${total} total, ${errCount} error(s) ═══${RESET}`);
  } else if (failed) {
    console.log(`${BOLD}\x1b[31m═══ FAILED: ${failed.msg} ═══${RESET}`);
  } else {
    console.log(`${DIM}═══ Job still in progress or not found ═══${RESET}`);
  }
  console.log('');
}

function traceChat(conversationId: string) {
  const logs = readLogs().filter((e) => e.conversationId?.startsWith(conversationId));

  if (logs.length === 0) {
    console.log(`No log entries found for conversation starting with "${conversationId}"`);
    return;
  }

  console.log(`\n${BOLD}═══ Chat Session ${logs[0].conversationId?.slice(0, 10)}... ═══${RESET}\n`);

  for (const entry of logs) {
    console.log(`  [${formatTime(entry.time)}] ${colorLevel(entry.level)}  ${entry.msg}`);
  }
  console.log('');
}

function traceExploration(explorationId: string) {
  const logs = readLogs().filter((e) => e.explorationId?.startsWith(explorationId));

  if (logs.length === 0) {
    console.log(`No log entries found for exploration starting with "${explorationId}"`);
    return;
  }

  console.log(`\n${BOLD}═══ Exploration ${logs[0].explorationId?.slice(0, 10)}... ═══${RESET}\n`);

  for (const entry of logs) {
    console.log(`  [${formatTime(entry.time)}] ${colorLevel(entry.level)}  ${entry.msg}`);
  }
  console.log('');
}

function showRecent() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const logs = readLogs().filter((e) => {
    const t = new Date(e.time).getTime();
    return t >= oneHourAgo && e.level >= 30; // INFO+
  });

  if (logs.length === 0) {
    console.log('No INFO+ log entries in the last hour.');
    return;
  }

  console.log(`\n${BOLD}Recent journeys (last hour, INFO+)${RESET}\n`);

  for (const entry of logs.slice(-50)) {
    const journey = entry.journey ? `[${entry.journey}]` : '';
    console.log(`  [${formatTime(entry.time)}] ${colorLevel(entry.level)} ${DIM}${journey}${RESET} ${entry.msg}`);
  }
  console.log(`\n  ${DIM}${logs.length} entries total${RESET}\n`);
}

function showErrors() {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const logs = readLogs().filter((e) => {
    const t = new Date(e.time).getTime();
    return t >= oneDayAgo && e.level >= 50; // ERROR+
  });

  if (logs.length === 0) {
    console.log('No errors in the last 24 hours.');
    return;
  }

  console.log(`\n${BOLD}\x1b[31mErrors (last 24h)${RESET}\n`);

  for (const entry of logs) {
    const journey = entry.journey ? `[${entry.journey}]` : '';
    console.log(`  [${formatTime(entry.time)}] ${journey} ${entry.msg}`);
    if (entry.err?.message) {
      console.log(`    ${DIM}${entry.err.message}${RESET}`);
    }
  }
  console.log(`\n  ${logs.length} error(s) total\n`);
}

function showLlm() {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const logs = readLogs().filter((e) => {
    const t = new Date(e.time).getTime();
    return (
      t >= oneDayAgo &&
      (e.journey === 'chat' || e.journey === 'exploration' || e.event?.startsWith('claude.')) &&
      (e.outputTokens != null || e.inputTokens != null)
    );
  });

  if (logs.length === 0) {
    console.log('No LLM calls in the last 24 hours.');
    return;
  }

  // Group by surface (chat, explore, recommend)
  const groups: Record<string, { model: string; calls: number; tokensIn: number; tokensOut: number; totalMs: number }> = {};

  for (const entry of logs) {
    const surface = entry.journey || 'unknown';
    const model = (entry.model as string) || 'unknown';
    const key = `${surface}:${model}`;

    if (!groups[key]) {
      groups[key] = { model, calls: 0, tokensIn: 0, tokensOut: 0, totalMs: 0 };
    }

    groups[key].calls++;
    groups[key].tokensIn += (entry.inputTokens as number) || 0;
    groups[key].tokensOut += (entry.outputTokens as number) || 0;
    groups[key].totalMs += (entry.durationMs as number) || 0;
  }

  console.log(`\n${BOLD}LLM Calls (last 24h)${RESET}`);
  console.log(`${'─'.repeat(75)}`);
  console.log(
    `  ${'Surface'.padEnd(12)} ${'Model'.padEnd(25)} ${'Calls'.padStart(5)}  ${'Tokens In'.padStart(10)}  ${'Tokens Out'.padStart(10)}  ${'Avg Latency'.padStart(11)}`
  );

  let totalCalls = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (const [key, data] of Object.entries(groups).sort()) {
    const surface = key.split(':')[0];
    const avgLatency = data.calls > 0 ? formatDuration(Math.round(data.totalMs / data.calls)) : '—';

    console.log(
      `  ${surface.padEnd(12)} ${data.model.padEnd(25)} ${String(data.calls).padStart(5)}  ${data.tokensIn.toLocaleString().padStart(10)}  ${data.tokensOut.toLocaleString().padStart(10)}  ${avgLatency.padStart(11)}`
    );

    totalCalls += data.calls;
    totalIn += data.tokensIn;
    totalOut += data.tokensOut;
  }

  console.log(`${'─'.repeat(75)}`);
  console.log(
    `  ${'Total'.padEnd(38)} ${String(totalCalls).padStart(5)}  ${totalIn.toLocaleString().padStart(10)}  ${totalOut.toLocaleString().padStart(10)}`
  );
  console.log('');
}

// ─── Main ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const arg = args[1];

switch (command) {
  case 'job':
    if (!arg) {
      console.error('Usage: npm run logs:trace -- job <jobId>');
      process.exit(1);
    }
    traceJob(arg);
    break;
  case 'chat':
    if (!arg) {
      console.error('Usage: npm run logs:trace -- chat <conversationId>');
      process.exit(1);
    }
    traceChat(arg);
    break;
  case 'exploration':
    if (!arg) {
      console.error('Usage: npm run logs:trace -- exploration <id>');
      process.exit(1);
    }
    traceExploration(arg);
    break;
  case 'recent':
    showRecent();
    break;
  case 'errors':
    showErrors();
    break;
  case 'llm':
    showLlm();
    break;
  default:
    console.log(`
${BOLD}logs:trace${RESET} — Journey navigator for Crescendo logs

${BOLD}Commands:${RESET}
  job <jobId>             Trace a specific job lifecycle
  chat <conversationId>   Trace a chat session
  exploration <id>        Trace an exploration run
  recent                  All INFO+ events in the last hour
  errors                  All errors in the last 24 hours
  llm                     LLM usage summary (last 24h)

${BOLD}Examples:${RESET}
  npm run logs:trace -- job cmnwb4c
  npm run logs:trace -- recent
  npm run logs:trace -- llm
`);
}
