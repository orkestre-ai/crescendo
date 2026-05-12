export interface QuickQuery {
  key: string;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  prompt: string;
  enabledTools?: string[]; // optional; if omitted, seeder uses all tools (backwards compatible)
}

export const QUICK_QUERIES: QuickQuery[] = [
  {
    key: 'sitewide-comparison',
    label: 'Compare to site average',
    description: 'How does this page perform vs the rest of the portfolio?',
    icon: 'BarChart3',
    prompt: `Compare this page's performance metrics against sitewide averages. Use the sitewide-compare tool to get the data. Highlight where this page is above or below average, rank it as a percentile, and identify the biggest opportunities for improvement.`,
  },
  {
    key: 'content-changes',
    label: 'Review content changes',
    description: 'What changed since the last content update?',
    icon: 'FileDiff',
    prompt: `Use the snapshot-compare tool to compare the current page content against the previous version. For each change, assess whether it aligns with CRO best practices. If performance data is available for both periods, correlate content changes with metric movements.`,
  },
  {
    key: 'traffic-sources',
    label: 'Traffic source breakdown',
    description: "Where are this page's visitors coming from?",
    icon: 'Globe',
    prompt: `Use the ga4-query tool to get a traffic source breakdown for this page over the last 30 days. Show sessions, conversions, and conversion rate by source/medium. Identify the highest-converting traffic sources and any sources with high traffic but low conversion that could be optimized.`,
  },
  {
    key: 'device-performance',
    label: 'Mobile vs desktop',
    description: 'How do different devices perform on this page?',
    icon: 'Smartphone',
    prompt: `Use the ga4-query tool to get device category performance for this page over the last 30 days. Compare mobile vs desktop vs tablet for sessions, conversion rate, bounce rate, and revenue. Based on the mobile traffic percentage, recommend whether this page should use urgency (mobile-first), narrative (desktop), or hybrid messaging.`,
  },
  {
    key: 'cta-alternatives',
    label: 'Generate CTA alternatives',
    description: 'Get campaign-grounded CTA suggestions',
    icon: 'MousePointerClick',
    prompt: `Use the org-search tool to understand the campaign or cause this donation page supports. Then generate 5 CTA alternatives grounded in the organization's own messaging and CRO best practices. For each CTA, specify whether it follows the Narrative, Urgency, or Hybrid messaging pattern, and explain the expected impact.`,
  },
  {
    key: 'trend-summary',
    label: '90-day trend summary',
    description: "Summarize this page's performance trajectory",
    icon: 'TrendingUp',
    prompt: `Use the page-performance tool to get this page's metrics over the last 90 days. Identify the overall trend (improving, declining, stable), any significant inflection points or anomalies, and correlate with known events if possible. Provide a clear summary of where the page is headed and what actions could improve the trajectory.`,
  },
];

// Parked: "General QA Audit" is hidden from the default explorations for go-live.
// The prompt and its exclusive page_content_audit tool need more polish before
// shipping. To re-enable: move this entry back into QUICK_QUERIES above, and
// remove the `hidden: true` flag from page_content_audit in exploration-constants.ts.
// Code is retained intentionally — do not delete.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LEGACY_QUICK_QUERIES: QuickQuery[] = [
  {
    key: 'general-qa-audit',
    label: 'General QA Audit',
    description: 'Scan the page for quality defects across metadata, content, technical, and compliance',
    icon: 'Search',
    enabledTools: ['page_content_audit', 'org_search'],
    prompt: `# General QA Audit

You are performing a quality audit on the fundraising page **{{pageName}}** ({{pageUrl}}).

Your goal: identify issues that could hurt conversion, trust, or page health, ranked by severity and confidence, so the user can fix them in priority order.

## Step 1 — Run the structured audit

Call the \`page_content_audit\` tool for pageId \`{{pageId}}\`. It returns ~15 checks with:

- \`status\`: pass / warn / fail / skip
- \`severity\`: critical / major / minor (the IMPACT class of the check; a passing critical check is not a finding)
- \`confidence\`: deterministic / heuristic / advisory (how much to trust the check itself)
- \`evidence\`: human-readable summary
- \`details\`: optional full arrays (flagged words, mixed-content refs, link inventory, etc.) — use these when you write findings so users see the real data, not a count
- \`suggestion\`: fix recipe

If a check's status is \`skip\` because of a missing rawHtml snapshot, tell the user to run a new DEEP scan and stop the audit early — do not fabricate findings from absent data.

## Step 2 — Diff against the previous run

The most recent previous audit is:

\`\`\`json
{{previousToolResult:page_content_audit}}
\`\`\`

If a previous run exists, start the report with a **What changed since last audit** section:
- **Regressions** — checks that moved from pass → warn/fail. Lead with these.
- **Fixes** — checks that moved from warn/fail → pass. Congratulate briefly.
- **Still outstanding** — checks that remained in warn/fail. Summarize as a count; don't re-explain.

If no previous run exists, state **Baseline audit — no prior data to compare against.**

## Step 3 — Advisory checks (LLM judgment)

Label this entire section **Advisory (LLM judgment — not deterministic)**. These are your opinions, not audit results:

1. **Title ↔ appeal subject alignment** — Does "{{pageTitle}}" describe the same subject as the appeal body?
   Appeal: "{{appealText}}"
2. **Grammar & tone** — Flag grammar issues (tense, awkward phrasing, passive voice weakening the ask). Spelling is covered by the deterministic tool.

## Step 4 — Org-grounded content evaluation

Call \`org_search\` with the org's domain. Compare the page copy to the org's broader public-facing messaging. Label the findings **Advisory — org grounding**.

## Step 5 — Write the report

Follow this structure **exactly**. Do not put passing checks in severity sections.

### Status strip

One line per severity class showing pass/warn/fail/skip counts:
- **Critical:** X pass, Y warn, Z fail, W skip
- **Major:** X pass, Y warn, Z fail, W skip
- **Minor:** X pass, Y warn, Z fail, W skip

### Findings (warn + fail only, grouped by severity)

For each finding, include:
- Check label
- Status + confidence (e.g., "fail · deterministic")
- Evidence — cite \`details\` when the check provides an array (e.g., list all flagged spellings or mixed-content URLs, not just a count)
- Fix — use the check's \`suggestion\` as the starting point; make it concrete to this page

Order: critical findings first, then major, then minor. Inside a severity, sort deterministic before heuristic.

### Advisory notes (not deterministic)

- Title ↔ appeal alignment
- Grammar & tone
- Org-grounded content evaluation

### The single most important fix

End with one sentence naming the highest-leverage action. If all critical checks passed, say so and pick the highest-impact major finding.

## Guardrails

- Never invent findings. Every claim must tie back to a check's evidence/details or a cited advisory observation.
- Do not describe a passing check as a finding. Passes belong in the status strip only.
- When details includes an array (flagged words, mixed-content URLs, link inventory), list the full array in the report — do not paraphrase as "several items."
- If a critical check skipped due to missing data, surface that as the lede, not a footnote.`,
  },
];
