import type { ReportDefinitionSeed } from './index';

/**
 * A tiny report that proves the whole path against the real property: one
 * query, an aggregate, a cell and a formula, two blocks, then the recheck. It is hidden
 * from the list of reports a person can start; run it with
 * `npx tsx src/scripts/run-report.ts --definition smoke-test`.
 */
export const smokeTest: ReportDefinitionSeed = {
  key: 'smoke-test',
  name: 'Smoke test',
  description:
    'Sessions and revenue for the last 7 full days. Checks that queries, the ledger, blocks and the recheck work.',
  prompt: `This is a smoke test of the report system. Make as few tool calls as you can.

1. Run one ga4_report: dimension "date", metrics "sessions" and "purchaseRevenue", for the 7 full days that end yesterday, sorted by date, oldest first.
2. Record four figures from that query:
   - sessions_7d: an aggregate, the sum of sessions. Unit count.
   - revenue_7d: an aggregate, the sum of purchaseRevenue. Unit currency.
   - sessions_last_day: a cell, the sessions on the last of the 7 days. Unit count.
   - revenue_per_session: a formula, revenue_7d divided by sessions_7d. Unit currency.
3. Write one note naming the 7 days and the four figure keys.
4. Call list_blocks, then add two blocks: a stat_tiles block with one tile for each of the four figures, and under it a prose block with one sentence that uses {{fig:sessions_7d}} and {{fig:revenue_7d}}.
5. Call finish_report.`,
  enabledTools: ['ga4_report'],
  maxSteps: 20,
  maxMinutes: 10,
  enabled: false,
};
