#!/usr/bin/env -S npx tsx
/**
 * Crescendo doctor — environment + runtime + credentials health check.
 *
 * Exit codes (D-02):
 *   0 = all green
 *   1 = at least one red (hard failure)
 *   2 = yellows only (warnings, no reds)
 *
 * Report-only (D-01): never modifies the machine. Prints copy-pasteable fix
 * commands under every yellow/red check. Mirrors the visual style of
 * setup-ga4.sh (ANSI colors + ✓/⚠/✗ icons, tiered banner headers).
 *
 * No HTTP calls: credentials tier reads directly from AppSettings via Prisma.
 * `getOrCreateSettings` is imported once and invoked once in main() — the
 * resulting AppSettings row is threaded into each credential check as a
 * parameter (I-05 fix).
 */
import './doctor-env';
import pc from 'picocolors';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getOrCreateSettings } from '@/lib/settings';
import type { AppSettings } from '@prisma/client';
import {
  rollUpExit,
  checkNodeVersion,
  parseEnvLocal,
  isStale,
  looksPlaceholderValue,
  type Check,
  type Verdict,
} from './doctor-helpers';

// ----- System tier -----
function sysNode(): Check {
  return checkNodeVersion(process.versions.node);
}

function sysNpm(): Check {
  try {
    const v = execSync('npm --version', { stdio: 'pipe' }).toString().trim();
    return { name: 'npm', verdict: 'green', detail: `v${v}` };
  } catch {
    return {
      name: 'npm',
      verdict: 'red',
      detail: 'not found',
      remediation: 'npm ships with Node.js — reinstall Node from https://nodejs.org',
    };
  }
}

function sysDocker(): Check {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return { name: 'Docker daemon', verdict: 'green' };
  } catch {
    return {
      name: 'Docker daemon',
      verdict: 'red',
      detail: 'not running',
      remediation:
        'Start Docker Desktop (macOS/Windows) or run: systemctl start docker (Linux)',
    };
  }
}

function sysGit(): Check {
  try {
    const v = execSync('git --version', { stdio: 'pipe' }).toString().trim();
    return {
      name: 'Git',
      verdict: 'green',
      detail: v.replace(/^git version /, ''),
    };
  } catch {
    return {
      name: 'Git',
      verdict: 'red',
      detail: 'not found',
      remediation: 'Install from https://git-scm.com/downloads',
    };
  }
}

function sysEnvLocal(): Check {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) {
    return {
      name: '.env.local',
      verdict: 'red',
      detail: 'missing',
      remediation: 'cp .env.example .env.local',
    };
  }
  const contents = fs.readFileSync(p, 'utf8');
  const { placeholders } = parseEnvLocal(contents);
  if (placeholders > 0) {
    return {
      name: '.env.local',
      verdict: 'yellow',
      detail: `${placeholders} placeholder value(s) still present`,
      remediation:
        'Edit .env.local and replace "your_..." values with real credentials',
    };
  }
  return { name: '.env.local', verdict: 'green' };
}

// ----- Runtime tier -----
function rtPostgres(): Check {
  try {
    execSync('docker exec crescendo-db pg_isready -U postgres', {
      stdio: 'ignore',
    });
    return { name: 'PostgreSQL', verdict: 'green', detail: 'reachable on :54320' };
  } catch {
    return {
      name: 'PostgreSQL',
      verdict: 'red',
      detail: 'not reachable',
      remediation: 'docker-compose up -d postgres',
    };
  }
}

function rtPrismaSchema(): Check {
  try {
    // stdio: 'pipe' captures stdout/stderr so the Prisma deprecation warning
    // (`warn The configuration property \`package.json#prisma\` is deprecated`)
    // does NOT pollute doctor output on the green path (RESEARCH Pitfall 3).
    execSync('npx prisma migrate status', { stdio: 'pipe' });
    return { name: 'Prisma schema', verdict: 'green', detail: 'in sync' };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const raw =
      err.stdout?.toString() ??
      err.stderr?.toString() ??
      'drift or pending migrations';
    // Pick the most informative line: skip banners/loader lines, prefer lines
    // containing drift/migration/connection keywords. Falls back to the last
    // non-empty line. Matches T-12-11: Prisma output does not contain URLs.
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^Prisma schema loaded/.test(l) && !/^Datasource /.test(l));
    const informative =
      lines.find((l) =>
        /drift|pending|following migrations|not reach|refused|timed? ?out|authentication/i.test(l)
      ) ??
      lines[lines.length - 1] ??
      'drift or pending migrations';
    return {
      name: 'Prisma schema',
      verdict: 'red',
      detail: informative.slice(0, 120),
      remediation: 'npx prisma migrate dev',
    };
  }
}

async function rtPlaywright(): Promise<Check> {
  try {
    const { chromium } = await import('playwright');
    const p = chromium.executablePath();
    if (fs.existsSync(p)) {
      return { name: 'Playwright Chromium', verdict: 'green' };
    }
    return {
      name: 'Playwright Chromium',
      verdict: 'yellow',
      detail: 'not installed (scraping will fail)',
      remediation: 'npx playwright install chromium',
    };
  } catch (e) {
    return {
      name: 'Playwright Chromium',
      verdict: 'yellow',
      detail: `check failed: ${(e as Error).message}`,
      remediation: 'npm install && npx playwright install chromium',
    };
  }
}

// ----- Credentials tier -----
// All three checks accept AppSettings as a parameter (I-05 fix) — no dynamic
// imports, no HTTP calls to localhost:3000. `getOrCreateSettings` is called
// exactly once in main() and the result is threaded here.
function credEn(s: AppSettings): Check {
  const hasKey = !!s.enApiKeyEncrypted || !!process.env.EN_API_TOKEN;
  if (!hasKey) {
    return {
      name: 'Engaging Networks token',
      verdict: 'red',
      detail: 'not configured',
      remediation:
        'Add via Settings UI (http://localhost:3000/settings) or EN_API_TOKEN in .env.local',
    };
  }
  if (s.enConnectionStatus === 'CONNECTED' && !isStale(s.enLastTestedAt)) {
    return {
      name: 'Engaging Networks token',
      verdict: 'green',
      detail: `last verified ${s.enLastTestedAt?.toISOString().slice(0, 10) ?? 'recently'}`,
    };
  }
  return {
    name: 'Engaging Networks token',
    verdict: 'yellow',
    detail: 'stored but not recently verified',
    remediation: 'Open Settings UI and click "Test connection"',
  };
}

function credGa4(s: AppSettings): Check {
  const hasCreds =
    (!!s.ga4PropertyIdEncrypted && !!s.ga4ServiceAccountKeyEncrypted) ||
    (!!process.env.GA4_PROPERTY_ID && !!process.env.GA4_SERVICE_ACCOUNT_KEY);
  if (!hasCreds) {
    return {
      name: 'GA4 credentials',
      verdict: 'red',
      detail: 'not configured',
      remediation: 'Run: npm run setup:ga4 (or configure manually in Settings UI)',
    };
  }
  if (s.ga4ConnectionStatus === 'CONNECTED' && !isStale(s.ga4LastTestedAt)) {
    return {
      name: 'GA4 credentials',
      verdict: 'green',
      detail: `last verified ${s.ga4LastTestedAt?.toISOString().slice(0, 10) ?? 'recently'}`,
    };
  }
  return {
    name: 'GA4 credentials',
    verdict: 'yellow',
    detail: 'stored but not recently verified',
    remediation: 'Open Settings UI and click "Test GA4 connection"',
  };
}

function credAnthropic(s: AppSettings): Check {
  // Settings-UI-saved keys are encrypted, so trust their presence. For the
  // env-var path, reject placeholder shapes (e.g. the "sk-ant-api03-..."
  // sample from .env.example) so a forgotten edit doesn't look configured.
  const envKey = process.env.ANTHROPIC_API_KEY;
  const hasEncrypted = !!s.anthropicApiKeyEncrypted;
  const hasRealEnvKey = !!envKey && !looksPlaceholderValue(envKey);

  if (!hasEncrypted && !hasRealEnvKey) {
    const detail = envKey
      ? 'placeholder value in .env.local (AI recommendations disabled)'
      : 'not configured (AI recommendations disabled)';
    return {
      name: 'Anthropic API key',
      verdict: 'yellow',
      detail,
      remediation: 'Add via Settings UI or ANTHROPIC_API_KEY in .env.local',
    };
  }
  return { name: 'Anthropic API key', verdict: 'green', detail: 'configured' };
}

// ----- Rendering -----
function icon(v: Verdict): string {
  if (v === 'green') return pc.green('✓');
  if (v === 'yellow') return pc.yellow('⚠');
  return pc.red('✗');
}

function printTier(title: string, checks: Check[]): void {
  console.log(`\n${pc.blue(pc.bold(`━━ ${title} ━━`))}\n`);
  for (const c of checks) {
    const detail = c.detail ? pc.dim(` — ${c.detail}`) : '';
    console.log(`  ${icon(c.verdict)} ${c.name}${detail}`);
    if (c.remediation && c.verdict !== 'green') {
      console.log(`      ${pc.dim('fix:')} ${c.remediation}`);
    }
  }
}

// ----- Main -----
export async function main(): Promise<number> {
  console.log(pc.bold(pc.blue('Crescendo doctor — environment health check')));

  const system: Check[] = [sysNode(), sysNpm(), sysDocker(), sysGit(), sysEnvLocal()];
  printTier('System', system);

  // Short-circuit DB-dependent checks when PostgreSQL is unreachable.
  // Without this, a single root cause (DB container not running) renders as
  // three separate red checks, burying the actionable remediation.
  const postgresCheck = rtPostgres();
  const prismaCheck: Check =
    postgresCheck.verdict === 'red'
      ? {
          name: 'Prisma schema',
          verdict: 'yellow',
          detail: 'skipped (PostgreSQL unreachable)',
        }
      : rtPrismaSchema();
  const runtime: Check[] = [postgresCheck, prismaCheck, await rtPlaywright()];
  printTier('Runtime', runtime);

  // I-05 fix: single DB round-trip for all three credential checks.
  // Defensive wrap: if Prisma can't reach the DB (bad URL, missing env,
  // unreachable host), surface as a single red check instead of crashing
  // the dashboard. This preserves the "report + suggest fix" posture (D-01).
  let credentials: Check[];
  if (postgresCheck.verdict === 'red') {
    credentials = [
      {
        name: 'Settings DB',
        verdict: 'yellow',
        detail: 'skipped (PostgreSQL unreachable)',
      },
    ];
  } else {
    try {
      const settings = await getOrCreateSettings();
      credentials = [credEn(settings), credGa4(settings), credAnthropic(settings)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const envMissing = /Environment variable not found:\s*([A-Z0-9_]+)/.exec(msg);
      // Pick the most informative line for non-env-missing errors: prefer lines
      // with actual error keywords over the Prisma error-class header.
      const msgLines = msg
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const informative =
        msgLines.find((l) =>
          /can't reach|refused|timed? ?out|authentication|denied|not found|database server/i.test(
            l
          )
        ) ??
        msgLines[0] ??
        'database error';
      credentials = [
        {
          name: 'Settings DB',
          verdict: 'red',
          detail: envMissing
            ? `missing env var: ${envMissing[1]}`
            : informative.slice(0, 120),
          remediation: envMissing
            ? `Ensure ${envMissing[1]} is set in .env.local, then re-run: npm run doctor`
            : 'Check .env.local DB URLs and that Docker Postgres is running: docker-compose up -d postgres',
        },
      ];
    }
  }
  printTier('Credentials', credentials);

  const all = [...system, ...runtime, ...credentials];
  const code = rollUpExit(all);
  const reds = all.filter((c) => c.verdict === 'red').length;
  const yellows = all.filter((c) => c.verdict === 'yellow').length;

  console.log();
  if (code === 0) {
    console.log(pc.green(pc.bold('All checks passed.')));
  } else if (code === 2) {
    console.log(pc.yellow(pc.bold(`${yellows} warning(s) — review above.`)));
  } else {
    console.log(pc.red(pc.bold(`${reds} red issue(s) — fix the items above.`)));
  }
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      pc.red('Doctor crashed:'),
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  });
