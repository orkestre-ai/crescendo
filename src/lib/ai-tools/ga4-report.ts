import type { protos } from '@google-analytics/data';
import { z } from 'zod';
import { GA4_NOT_CONFIGURED, getGa4Clients, type Ga4Clients } from '@/lib/ga4-client';
import { createAiToolLogger } from '@/lib/logging/journeys';
import { redactEmails } from './redact';
import type { ToolSkill } from './types';

type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type FilterExpression = protos.google.analytics.data.v1beta.IFilterExpression;
type SamplingMetadata = protos.google.analytics.data.v1beta.ISamplingMetadata;

export type Ga4Filter =
  | { and?: Ga4Filter[]; or?: Ga4Filter[]; not?: Ga4Filter }
  | {
      field: string;
      match: 'exact' | 'contains' | 'beginsWith' | 'endsWith' | 'regex' | 'inList';
      value?: string;
      values?: string[];
      caseSensitive?: boolean;
    }
  | { field: string; op: '<' | '<=' | '=' | '>=' | '>'; number: number };

export interface Ga4ReportInput {
  dimensions: string[];
  metrics: string[];
  dateRanges: { startDate: string; endDate: string; name?: string }[];
  dimensionFilter?: Ga4Filter;
  metricFilter?: Ga4Filter;
  orderBys?: { field: string; desc?: boolean }[];
  limit?: number;
  offset?: number;
}

export interface Ga4ReportResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  truncated: boolean;
  sampled: boolean;
  samplingNote: string | null;
  thresholded: boolean;
  otherRow: boolean;
  timeZone: string;
  currencyCode: string;
  redactedEmails: number;
}

export const GA4_REPORT_DEFAULT_LIMIT = 100;
export const GA4_REPORT_MAX_LIMIT = 1000;

const MATCH_TYPES = {
  exact: 'EXACT',
  contains: 'CONTAINS',
  beginsWith: 'BEGINS_WITH',
  endsWith: 'ENDS_WITH',
  regex: 'PARTIAL_REGEXP',
} as const;

const OPERATIONS = {
  '<': 'LESS_THAN',
  '<=': 'LESS_THAN_OR_EQUAL',
  '=': 'EQUAL',
  '>=': 'GREATER_THAN_OR_EQUAL',
  '>': 'GREATER_THAN',
} as const;

/**
 * Thrown for a date that is not YYYY-MM-DD. A saved query is run again later,
 * and "yesterday" would then ask for a different day.
 */
export class RelativeDateError extends Error {}

export function assertAbsoluteDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RelativeDateError(
      `${label} "${value}" is not allowed. Dates must be absolute, in YYYY-MM-DD format; relative dates such as "yesterday" or "30daysAgo" are rejected.`
    );
  }
}

function toFilterExpression(filter: Ga4Filter): FilterExpression {
  if ('op' in filter) {
    return {
      filter: {
        fieldName: filter.field,
        numericFilter: {
          operation: OPERATIONS[filter.op],
          value: Number.isInteger(filter.number)
            ? { int64Value: String(filter.number) }
            : { doubleValue: filter.number },
        },
      },
    };
  }

  if ('match' in filter) {
    const caseSensitive = filter.caseSensitive ?? false;
    if (filter.match === 'inList') {
      if (!filter.values?.length) {
        throw new Error(`Filter on "${filter.field}" with match "inList" needs "values".`);
      }
      return {
        filter: { fieldName: filter.field, inListFilter: { values: filter.values, caseSensitive } },
      };
    }
    if (filter.value === undefined) {
      throw new Error(`Filter on "${filter.field}" with match "${filter.match}" needs "value".`);
    }
    return {
      filter: {
        fieldName: filter.field,
        stringFilter: { matchType: MATCH_TYPES[filter.match], value: filter.value, caseSensitive },
      },
    };
  }

  const set = [filter.and, filter.or, filter.not].filter((group) => group !== undefined);
  if (set.length !== 1) {
    throw new Error('A filter group needs exactly one of "and", "or" or "not".');
  }
  if (filter.and) return { andGroup: { expressions: filter.and.map(toFilterExpression) } };
  if (filter.or) return { orGroup: { expressions: filter.or.map(toFilterExpression) } };
  return { notExpression: toFilterExpression(filter.not!) };
}

/**
 * Turn a report input into the v1beta runReport request. Pure: no network.
 */
export function buildReportRequest(input: Ga4ReportInput, propertyId: string): RunReportRequest {
  if (input.dateRanges.length < 1 || input.dateRanges.length > 2) {
    throw new Error('Give one or two date ranges.');
  }
  for (const range of input.dateRanges) {
    assertAbsoluteDate(range.startDate, 'startDate');
    assertAbsoluteDate(range.endDate, 'endDate');
  }

  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? GA4_REPORT_DEFAULT_LIMIT), 1),
    GA4_REPORT_MAX_LIMIT
  );

  const request: RunReportRequest = {
    property: propertyId,
    dimensions: input.dimensions.map((name) => ({ name })),
    metrics: input.metrics.map((name) => ({ name })),
    dateRanges: input.dateRanges.map(({ startDate, endDate, name }) =>
      name ? { startDate, endDate, name } : { startDate, endDate }
    ),
    limit,
  };

  if (input.dimensionFilter) request.dimensionFilter = toFilterExpression(input.dimensionFilter);
  if (input.metricFilter) request.metricFilter = toFilterExpression(input.metricFilter);
  if (input.offset) request.offset = input.offset;
  if (input.orderBys?.length) {
    request.orderBys = input.orderBys.map(({ field, desc }) => {
      if (input.metrics.includes(field)) {
        return { metric: { metricName: field }, desc: desc ?? false };
      }
      if (input.dimensions.includes(field)) {
        return { dimension: { dimensionName: field }, desc: desc ?? false };
      }
      throw new Error(
        `Cannot sort by "${field}": it is not one of the requested dimensions or metrics.`
      );
    });
  }

  return request;
}

/**
 * Say what share of events a sampled result was estimated from. One entry
 * per date range. Null when the result is not sampled.
 */
export function describeSampling(samples: SamplingMetadata[] | null | undefined): string | null {
  if (!samples?.length) return null;
  const shares = samples.map((sample) => {
    const read = Number(String(sample.samplesReadCount ?? 0));
    const space = Number(String(sample.samplingSpaceSize ?? 0));
    const percent = space > 0 ? `${((read / space) * 100).toFixed(1)}%` : 'an unknown share';
    return `${percent} of events (${read} of ${space})`;
  });
  return `Sampled: GA4 estimated these figures from ${shares.join(' and ')}.`;
}

/**
 * Turn a runReport response into headers and rows, with the flags a reader
 * needs to judge the figures. Email addresses are removed here, so nothing
 * downstream sees them. Pure: no network.
 */
export function shapeReportResponse(response: RunReportResponse): Ga4ReportResult {
  const dimensionHeaders = (response.dimensionHeaders || []).map((h) => h.name || '');
  const metricHeaders = (response.metricHeaders || []).map((h) => h.name || '');

  const rawRows = (response.rows || []).map((row) => {
    const values: Record<string, string> = {};
    (row.dimensionValues || []).forEach((v, i) => {
      values[dimensionHeaders[i]] = v.value || '';
    });
    (row.metricValues || []).forEach((v, i) => {
      values[metricHeaders[i]] = v.value || '';
    });
    return values;
  });

  // With two date ranges GA4 counts and limits row groups, not rows: each
  // group comes back once per range, told apart by the dateRange column.
  const groupHeaders = dimensionHeaders.filter((header) => header !== 'dateRange');
  const groups = new Set(
    rawRows.map((row) => groupHeaders.map((header) => row[header]).join('\u0000'))
  ).size;
  const returned = dimensionHeaders.includes('dateRange') ? groups : rawRows.length;

  const { rows, count } = redactEmails(rawRows);
  const totalRows = response.rowCount ?? returned;
  const samplingNote = describeSampling(response.metadata?.samplingMetadatas);

  return {
    headers: [...dimensionHeaders, ...metricHeaders],
    rows,
    totalRows,
    truncated: totalRows > returned,
    sampled: samplingNote !== null,
    samplingNote,
    thresholded: response.metadata?.subjectToThresholding ?? false,
    otherRow: response.metadata?.dataLossFromOtherRow ?? false,
    timeZone: response.metadata?.timeZone ?? '',
    currencyCode: response.metadata?.currencyCode ?? '',
    redactedEmails: count,
  };
}

/**
 * Run `build`, and when it rejects a relative date, add the property's
 * current date to the message so the caller can work out the absolute one.
 */
export async function namingPropertyToday<T>(build: () => T, clients: Ga4Clients): Promise<T> {
  try {
    return build();
  } catch (err) {
    if (!(err instanceof RelativeDateError)) throw err;

    let timeZone: string | null | undefined;
    try {
      const [probe] = await clients.data.runReport({
        property: clients.propertyId,
        dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
        metrics: [{ name: 'sessions' }],
        limit: 1,
      });
      timeZone = probe.metadata?.timeZone;
    } catch {
      // The date message below still stands without the time zone.
    }
    if (!timeZone) throw err;

    // en-CA formats a date as YYYY-MM-DD.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    throw new RelativeDateError(
      `${err.message} Today is ${today} in the property's time zone (${timeZone}).`
    );
  }
}

export async function runGa4Report(input: Ga4ReportInput): Promise<Ga4ReportResult> {
  const clients = await getGa4Clients();
  if (!clients) throw new Error(GA4_NOT_CONFIGURED);

  const request = await namingPropertyToday(
    () => buildReportRequest(input, clients.propertyId),
    clients
  );
  const [response] = await clients.data.runReport(request);
  return shapeReportResponse(response);
}

const stringFilterSchema = z.object({
  field: z.string().describe('The dimension name to filter on'),
  match: z
    .enum(['exact', 'contains', 'beginsWith', 'endsWith', 'regex', 'inList'])
    .describe('"regex" matches anywhere in the value; anchor with ^ and $ for a whole match'),
  value: z.string().optional().describe('The text to match. Required unless match is "inList"'),
  values: z.array(z.string()).optional().describe('The list to match. Required for "inList"'),
  caseSensitive: z.boolean().optional().describe('Default false'),
});

const numericFilterSchema = z.object({
  field: z.string().describe('The metric name to filter on'),
  op: z.enum(['<', '<=', '=', '>=', '>']),
  number: z.number(),
});

// The group comes last and is strict. Every key in it is optional, so a loose
// group placed first would match a field filter and silently drop its keys.
export const ga4FilterSchema: z.ZodType<Ga4Filter> = z.lazy(() =>
  z.union([
    stringFilterSchema,
    numericFilterSchema,
    z.strictObject({
      and: z.array(ga4FilterSchema).optional().describe('Every filter must match'),
      or: z.array(ga4FilterSchema).optional().describe('At least one filter must match'),
      not: ga4FilterSchema.optional().describe('The filter must not match'),
    }),
  ])
);

export const ga4ReportInputSchema: z.ZodType<Ga4ReportInput> = z.object({
  dimensions: z
    .array(z.string())
    .describe('GA4 dimension names (e.g., date, sessionSourceMedium, deviceCategory, pagePath)'),
  metrics: z
    .array(z.string())
    .describe('GA4 metric names (e.g., sessions, totalUsers, eventCount, purchaseRevenue)'),
  dateRanges: z
    .array(
      z.object({
        startDate: z.string().describe('YYYY-MM-DD. Relative dates are rejected'),
        endDate: z.string().describe('YYYY-MM-DD. Relative dates are rejected'),
        name: z.string().optional().describe('A label for this range in the dateRange column'),
      })
    )
    .min(1)
    .max(2)
    .describe('One date range, or two to compare periods in one report'),
  dimensionFilter: ga4FilterSchema
    .optional()
    .describe('Keep only rows whose dimension values match. Groups nest with and / or / not'),
  metricFilter: ga4FilterSchema
    .optional()
    .describe('Keep only rows whose metric values match, applied after aggregation'),
  orderBys: z
    .array(
      z.object({
        field: z.string().describe('One of the requested dimensions or metrics'),
        desc: z.boolean().optional().describe('Largest first. Default false'),
      })
    )
    .optional()
    .describe('Sort order, most important first'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Rows to return. Default ${GA4_REPORT_DEFAULT_LIMIT}, maximum ${GA4_REPORT_MAX_LIMIT}`
    ),
  offset: z.number().int().min(0).optional().describe('Rows to skip, for reading the next page'),
});

export const ga4ReportTool: ToolSkill = {
  schema: {
    name: 'ga4_report',
    description:
      'Run a full Google Analytics 4 report: any dimensions and metrics, nested dimension and metric filters, sorting, one or two date ranges, and up to 1,000 rows. Says whether the result is cut off, sampled or thresholded.',
    input_schema: z.toJSONSchema(ga4ReportInputSchema) as Record<string, unknown>,
  },

  instructions: `Use this tool for sitewide GA4 analysis that needs filters, sorting, more than one date range or more than 100 rows.

Dates must be absolute (YYYY-MM-DD). Relative dates such as "yesterday" are rejected; the error names the property's current date so you can work out the right one.

Rows: 100 is the default and 1,000 the maximum. GA4 returns rows in no useful order unless you sort, so set orderBys whenever you want a "top" list or a time series in date order. When "truncated" is true the list is cut off: "totalRows" says how many rows exist. Narrow the filter, raise the limit, or read on with offset, and never present a truncated list as complete.

Filters: a filter is one condition or a group. A text condition is { field, match, value } with match exact, contains, beginsWith, endsWith or regex, or { field, match: "inList", values }. A number condition is { field, op, number }. A group is { and: [...] }, { or: [...] } or { not: ... }, and groups nest. Put dimension conditions in dimensionFilter and metric conditions in metricFilter.

Two date ranges add a "dateRange" column that tells the rows of each range apart. Each row then comes back once per range, and limit and "totalRows" count rows per range, so limit 100 can return 200 rows.

Read the flags before you use a figure: "sampled" (with "samplingNote") means GA4 estimated it from a share of events; "thresholded" means GA4 withheld small rows to protect privacy; "otherRow" means some rows were rolled into "(other)". "timeZone" and "currencyCode" are the property's own. Email addresses in results are replaced with "[email removed]".`,

  async execute(params) {
    const toolLog = createAiToolLogger('ga4_report');
    const start = Date.now();
    const input = params as unknown as Ga4ReportInput;
    const dates = input.dateRanges.map((r) => `${r.startDate} to ${r.endDate}`).join(' and ');

    try {
      const data = await runGa4Report(input);

      toolLog.ga4Query(dates, input.metrics, data.rows.length);
      toolLog.executed('sitewide', Date.now() - start, data.rows.length);

      const flags = [
        data.truncated && 'truncated',
        data.sampled && 'sampled',
        data.thresholded && 'thresholded',
      ].filter(Boolean);
      return {
        data,
        summary: `${data.rows.length} of ${data.totalRows} rows returned for ${input.dimensions.join(', ')} x ${input.metrics.join(', ')} (${dates})${flags.length ? ` [${flags.join(', ')}]` : ''}`,
      };
    } catch (err) {
      toolLog.error('sitewide', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
