#!/usr/bin/env npx tsx
/**
 * Live Filtered Tail — `npm run logs:tail`
 *
 * Stream log events from dev-logs.json with optional filters.
 *
 * Usage:
 *   npm run logs:tail                              All INFO+ events
 *   npm run logs:tail -- --journey job             Job events only
 *   npm run logs:tail -- --level warn              Warnings and errors
 *   npm run logs:tail -- --job <jobId>             Specific active job
 *   npm run logs:tail -- --journey chat,exploration LLM calls only
 */

import { createReadStream, existsSync, readFileSync, watchFile, statSync } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';

const LOG_FILE = resolve(process.cwd(), 'logs/dev-logs.json');

const LEVEL_MAP: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_NAMES: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO ',
  40: 'WARN ',
  50: 'ERROR',
  60: 'FATAL',
};

const LEVEL_COLORS: Record<number, string> = {
  10: '\x1b[90m',
  20: '\x1b[36m',
  30: '\x1b[32m',
  40: '\x1b[33m',
  50: '\x1b[31m',
  60: '\x1b[35m',
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

// ─── Parse args ──────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    level: number;
    journeys: string[];
    jobId?: string;
  } = {
    level: LEVEL_MAP.info,
    journeys: [],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--level':
        opts.level = LEVEL_MAP[args[++i]?.toLowerCase()] ?? LEVEL_MAP.info;
        break;
      case '--journey':
        opts.journeys = (args[++i] || '').split(',').filter(Boolean);
        break;
      case '--job':
        opts.jobId = args[++i];
        break;
    }
  }

  return opts;
}

// ─── Format ──────────────────────────────────────────────────

function formatEntry(entry: Record<string, unknown>): string | null {
  const level = entry.level as number;
  const time = entry.time as string;
  const msg = entry.msg as string;
  const journey = entry.journey as string | undefined;

  const t = new Date(time).toLocaleTimeString('en-US', { hour12: false });
  const color = LEVEL_COLORS[level] || '';
  const name = LEVEL_NAMES[level] || `L${level}`;
  const tag = journey ? `${DIM}[${journey}]${RESET} ` : '';

  return `[${t}] ${color}${name}${RESET} ${tag}${msg}`;
}

// ─── Tail ────────────────────────────────────────────────────

async function main() {
  if (!existsSync(LOG_FILE)) {
    console.error(`Log file not found: ${LOG_FILE}`);
    console.error('Run the dev server first to generate logs.');
    process.exit(1);
  }

  const opts = parseArgs();

  console.log(`${DIM}Tailing ${LOG_FILE}${RESET}`);
  console.log(
    `${DIM}Level: ${Object.entries(LEVEL_MAP).find(([, v]) => v === opts.level)?.[0] || 'info'}+${
      opts.journeys.length ? ` | Journeys: ${opts.journeys.join(', ')}` : ''
    }${opts.jobId ? ` | Job: ${opts.jobId}` : ''}${RESET}`
  );
  console.log(`${DIM}${'─'.repeat(60)}${RESET}`);

  // Read existing content first (last 20 lines)
  const initialLines = readLastLines(LOG_FILE, 20);
  for (const line of initialLines) {
    const entry = tryParse(line);
    if (entry && matchesFilter(entry, opts)) {
      const formatted = formatEntry(entry);
      if (formatted) console.log(formatted);
    }
  }

  // Watch for new content
  let lastSize = statSync(LOG_FILE).size;

  watchFile(LOG_FILE, { interval: 500 }, () => {
    const currentSize = statSync(LOG_FILE).size;

    if (currentSize <= lastSize) {
      lastSize = currentSize;
      return;
    }

    // Read new content
    const stream = createReadStream(LOG_FILE, {
      start: lastSize,
      encoding: 'utf-8',
    });

    const rl = createInterface({ input: stream });

    rl.on('line', (line) => {
      const entry = tryParse(line);
      if (entry && matchesFilter(entry, opts)) {
        const formatted = formatEntry(entry);
        if (formatted) console.log(formatted);
      }
    });

    lastSize = currentSize;
  });

  // Keep alive
  process.on('SIGINT', () => {
    console.log(`\n${DIM}Stopped.${RESET}`);
    process.exit(0);
  });
}

function matchesFilter(
  entry: Record<string, unknown>,
  opts: { level: number; journeys: string[]; jobId?: string }
): boolean {
  const level = entry.level as number;
  if (level < opts.level) return false;

  if (opts.journeys.length > 0) {
    const journey = entry.journey as string;
    if (!journey || !opts.journeys.includes(journey)) return false;
  }

  if (opts.jobId) {
    const jobId = entry.jobId as string;
    if (!jobId || !jobId.startsWith(opts.jobId)) return false;
  }

  return true;
}

function tryParse(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line.trim());
  } catch {
    return null;
  }
}

function readLastLines(filePath: string, count: number): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l: string) => l.trim());
  return lines.slice(-count);
}

main().catch(console.error);
