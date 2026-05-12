// Canonical tool mapping: DB key (underscore, matches AI_TOOLS) -> display label
// Per D-03: the 6 available tools.
// `hidden: true` removes a tool from the UI picker but keeps it in TOOL_KEYS,
// so zod validation still accepts the key for any pre-existing exploration
// rows that reference it. Underlying tool registration is unaffected.
export const AVAILABLE_TOOLS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly hidden?: boolean;
}> = [
  {
    key: 'ga4_query',
    label: 'GA4 Query',
    description: 'Query Google Analytics data',
  },
  {
    key: 'org_search',
    label: 'Org Search',
    description: 'Search organization context',
  },
  {
    key: 'page_content_audit',
    label: 'Page Content Audit',
    description: 'Run 15 deterministic QA checks on page content',
    hidden: true,
  },
  {
    key: 'page_performance',
    label: 'Page Performance',
    description: 'Get page metric trends',
  },
  {
    key: 'sitewide_compare',
    label: 'Sitewide Compare',
    description: 'Compare against portfolio',
  },
  {
    key: 'snapshot_compare',
    label: 'Snapshot Compare',
    description: 'Compare content versions',
  },
] as const;

export const TOOL_KEYS = AVAILABLE_TOOLS.map((t) => t.key);
export type ToolKey = (typeof TOOL_KEYS)[number];

// ~15 curated Lucide icons relevant to analytics/fundraising
export const EXPLORATION_ICONS = [
  { value: 'BarChart3', label: 'Bar Chart' },
  { value: 'TrendingUp', label: 'Trending Up' },
  { value: 'Globe', label: 'Globe' },
  { value: 'Smartphone', label: 'Smartphone' },
  { value: 'MousePointerClick', label: 'Click' },
  { value: 'FileDiff', label: 'File Diff' },
  { value: 'Search', label: 'Search' },
  { value: 'Users', label: 'Users' },
  { value: 'DollarSign', label: 'Dollar' },
  { value: 'Target', label: 'Target' },
  { value: 'Lightbulb', label: 'Lightbulb' },
  { value: 'Zap', label: 'Zap' },
  { value: 'LineChart', label: 'Line Chart' },
  { value: 'PieChart', label: 'Pie Chart' },
  { value: 'Activity', label: 'Activity' },
] as const;

export const ICON_VALUES = EXPLORATION_ICONS.map((i) => i.value);

export const EXPLORATION_TEMPLATE_VARIABLES = [
  '{{pageName}}',
  '{{pageUrl}}',
  '{{pageId}}',
  '{{pageTitle}}',
  '{{appealText}}',
  '{{pageViews7d}}',
  '{{conversions7d}}',
  '{{revenue7d}}',
  '{{conversionRate7d}}',
  '{{bounceRate7d}}',
  '{{pageViews30d}}',
  '{{conversions30d}}',
  '{{revenue30d}}',
  '{{conversionRate30d}}',
  '{{bounceRate30d}}',
  '{{previousToolResult:TOOL_NAME}}',
] as const;
