import { tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from '@/lib/ai-tools/types';
import { ga4QueryTool } from '@/lib/ai-tools/ga4-query';
import { orgSearchTool } from '@/lib/ai-tools/org-search';
import { pageContentAuditTool } from '@/lib/ai-tools/page-content-audit';
import { pagePerformanceTool } from '@/lib/ai-tools/page-performance';
import { sitewideCompareTool } from '@/lib/ai-tools/sitewide-compare';
import { snapshotCompareTool } from '@/lib/ai-tools/snapshot-compare';

/**
 * AI SDK tool definitions using Zod schemas.
 * Each tool wraps the existing execute logic from src/lib/ai-tools/*.ts.
 */

export const ga4Query = tool<
  {
    dimensions: string[];
    metrics: string[];
    startDate: string;
    endDate: string;
    pagePathFilter?: string;
  },
  ToolResult
>({
  description:
    'Run a custom Google Analytics 4 query with any combination of dimensions and metrics. Returns tabular results for the specified date range.',
  inputSchema: z.object({
    dimensions: z
      .array(z.string())
      .describe(
        'GA4 dimension names (e.g., sessionSource, deviceCategory, country, date, pagePath)'
      ),
    metrics: z
      .array(z.string())
      .describe(
        'GA4 metric names (e.g., sessions, conversions, purchaseRevenue, bounceRate)'
      ),
    startDate: z
      .string()
      .describe('Start date in YYYY-MM-DD format or relative like "30daysAgo"'),
    endDate: z.string().describe('End date in YYYY-MM-DD format or "today"'),
    pagePathFilter: z
      .string()
      .optional()
      .describe('Optional: filter results to a specific page path'),
  }),
  execute: async (params) => {
    return await ga4QueryTool.execute(params as Record<string, unknown>);
  },
});

export const orgSearch = tool<
  {
    url?: string;
    searchQuery?: string;
    orgDomain: string;
  },
  ToolResult
>({
  description:
    "Fetch and read a page from the organization's website, or search the org's domain for relevant content. Use this to understand campaign context and generate grounded content suggestions.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe("Full URL to fetch from the org's website. Must be on the org's domain."),
    searchQuery: z
      .string()
      .optional()
      .describe(
        "Search query to run scoped to the org's domain. Provide this OR url, not both."
      ),
    orgDomain: z
      .string()
      .describe(
        "The organization's website domain (e.g., oxfam.ca). Required for domain validation."
      ),
  }),
  execute: async (params) => {
    return await orgSearchTool.execute(params as Record<string, unknown>);
  },
});

export const pagePerformance = tool<
  {
    pageId: string;
    startDate: string;
    endDate: string;
    compareStartDate?: string;
    compareEndDate?: string;
  },
  ToolResult
>({
  description:
    "Retrieve this page's performance metrics for a specific date range, or compare two date ranges side-by-side.",
  inputSchema: z.object({
    pageId: z.string().describe('The page ID'),
    startDate: z.string().describe('Start date in YYYY-MM-DD format'),
    endDate: z.string().describe('End date in YYYY-MM-DD format'),
    compareStartDate: z
      .string()
      .optional()
      .describe('Optional: start date of comparison period'),
    compareEndDate: z
      .string()
      .optional()
      .describe('Optional: end date of comparison period'),
  }),
  execute: async (params) => {
    return await pagePerformanceTool.execute(params as Record<string, unknown>);
  },
});

export const sitewideCompare = tool<
  {
    pageId: string;
    days?: number;
  },
  ToolResult
>({
  description:
    "Compare this page's performance metrics against sitewide averages across all tracked pages. Returns both sets of metrics plus the delta and percentile ranking.",
  inputSchema: z.object({
    pageId: z.string().describe('The page ID to compare'),
    days: z.number().optional().describe('Number of days to look back (default 30)'),
  }),
  execute: async (params) => {
    return await sitewideCompareTool.execute(params as Record<string, unknown>);
  },
});

export const snapshotCompare = tool<
  {
    pageId: string;
    snapshotIndex?: number;
  },
  ToolResult
>({
  description:
    'Compare the current page content against a previous content snapshot. Returns a field-by-field diff showing what changed between versions.',
  inputSchema: z.object({
    pageId: z.string().describe('The page ID to compare snapshots for'),
    snapshotIndex: z
      .number()
      .optional()
      .describe(
        'Index of the previous snapshot to compare against (0 = most recent previous, 1 = one before that). Defaults to 0.'
      ),
  }),
  execute: async (params) => {
    return await snapshotCompareTool.execute(params as Record<string, unknown>);
  },
});

export const pageContentAudit = tool<
  {
    pageId: string;
  },
  ToolResult
>({
  description:
    'Run a structured quality audit on a fundraising page. Returns ~15 deterministic checks grouped by severity with evidence and suggestions.',
  inputSchema: z.object({
    pageId: z.string().describe('The FundraisingPage ID to audit.'),
  }),
  execute: async (params) => {
    return await pageContentAuditTool.execute(params as Record<string, unknown>);
  },
});

/**
 * All tools keyed by their tool name.
 */
export const allTools = {
  ga4_query: ga4Query,
  org_search: orgSearch,
  page_content_audit: pageContentAudit,
  page_performance: pagePerformance,
  sitewide_compare: sitewideCompare,
  snapshot_compare: snapshotCompare,
};

/**
 * Get a filtered subset of tools by name.
 * If no filter is provided, returns all tools.
 */
export function getTools(enabledTools?: string[]) {
  if (!enabledTools) return allTools;
  return Object.fromEntries(
    Object.entries(allTools).filter(([key]) => enabledTools.includes(key))
  ) as typeof allTools;
}

/**
 * Existing tool skill objects keyed by name, for reading instructions.
 */
const TOOL_SKILLS = {
  ga4_query: ga4QueryTool,
  org_search: orgSearchTool,
  page_content_audit: pageContentAuditTool,
  page_performance: pagePerformanceTool,
  sitewide_compare: sitewideCompareTool,
  snapshot_compare: snapshotCompareTool,
};

/**
 * Get human-readable tool instructions for inclusion in system prompts.
 * Reads the `instructions` field from the existing ToolSkill objects.
 */
export function getToolInstructions(enabledTools?: string[]): string {
  const entries = enabledTools
    ? Object.entries(TOOL_SKILLS).filter(([key]) => enabledTools.includes(key))
    : Object.entries(TOOL_SKILLS);
  return entries
    .map(([, t]) => `### ${t.schema.name}\n${t.instructions}`)
    .join('\n\n');
}
