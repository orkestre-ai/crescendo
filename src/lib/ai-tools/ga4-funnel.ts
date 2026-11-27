import type { protos } from '@google-analytics/data';
import { z } from 'zod';
import { GA4_NOT_CONFIGURED, getGa4Clients } from '@/lib/ga4-client';
import { createAiToolLogger } from '@/lib/logging/journeys';
import { assertAbsoluteDate, describeSampling, namingPropertyToday } from './ga4-report';
import { redactEmails } from './redact';
import type { ToolSkill } from './types';

type RunFunnelReportRequest = protos.google.analytics.data.v1alpha.IRunFunnelReportRequest;
type RunFunnelReportResponse = protos.google.analytics.data.v1alpha.IRunFunnelReportResponse;
type FunnelParameterFilterExpression =
  protos.google.analytics.data.v1alpha.IFunnelParameterFilterExpression;

export interface Ga4FunnelInput {
  steps: {
    name: string;
    eventName: string;
    params?: { name: string; match: 'exact' | 'contains' | 'beginsWith'; value: string }[];
  }[];
  dateRange: { startDate: string; endDate: string };
  breakdownDimension?: string;
  openFunnel?: boolean;
}

export interface Ga4FunnelResult {
  headers: string[];
  rows: Record<string, string>[];
  sampled: boolean;
  samplingNote: string | null;
  redactedEmails: number;
}

const MATCH_TYPES = {
  exact: 'EXACT',
  contains: 'CONTAINS',
  beginsWith: 'BEGINS_WITH',
} as const;

/**
 * Turn a funnel input into the v1alpha runFunnelReport request. Pure: no
 * network. A step is an event, narrowed by its event parameters (such as
 * page_location), which is how a funnel filters; pagePath is not available.
 */
export function buildFunnelRequest(
  input: Ga4FunnelInput,
  propertyId: string
): RunFunnelReportRequest {
  assertAbsoluteDate(input.dateRange.startDate, 'startDate');
  assertAbsoluteDate(input.dateRange.endDate, 'endDate');

  const request: RunFunnelReportRequest = {
    property: propertyId,
    dateRanges: [{ startDate: input.dateRange.startDate, endDate: input.dateRange.endDate }],
    funnel: {
      isOpenFunnel: input.openFunnel ?? false,
      steps: input.steps.map((step) => {
        const conditions: FunnelParameterFilterExpression[] = (step.params ?? []).map((param) => ({
          funnelParameterFilter: {
            eventParameterName: param.name,
            stringFilter: { matchType: MATCH_TYPES[param.match], value: param.value },
          },
        }));
        return {
          name: step.name,
          filterExpression: {
            funnelEventFilter: {
              eventName: step.eventName,
              ...(conditions.length === 1 && { funnelParameterFilterExpression: conditions[0] }),
              ...(conditions.length > 1 && {
                funnelParameterFilterExpression: { andGroup: { expressions: conditions } },
              }),
            },
          },
        };
      }),
    },
  };

  if (input.breakdownDimension) {
    request.funnelBreakdown = { breakdownDimension: { name: input.breakdownDimension } };
  }

  return request;
}

/**
 * Flatten the response's funnelTable into the same headers and rows as a
 * report. Email addresses are removed here. Pure: no network.
 */
export function shapeFunnelResponse(response: RunFunnelReportResponse): Ga4FunnelResult {
  const table = response.funnelTable;
  const dimensionHeaders = (table?.dimensionHeaders || []).map((h) => h.name || '');
  const metricHeaders = (table?.metricHeaders || []).map((h) => h.name || '');

  const rawRows = (table?.rows || []).map((row) => {
    const values: Record<string, string> = {};
    (row.dimensionValues || []).forEach((v, i) => {
      values[dimensionHeaders[i]] = v.value || '';
    });
    (row.metricValues || []).forEach((v, i) => {
      values[metricHeaders[i]] = v.value || '';
    });
    return values;
  });

  const { rows, count } = redactEmails(rawRows);
  const samplingNote = describeSampling(table?.metadata?.samplingMetadatas);

  return {
    // With a breakdown GA4 lists the metric headers twice.
    headers: [...new Set([...dimensionHeaders, ...metricHeaders])],
    rows,
    sampled: samplingNote !== null,
    samplingNote,
    redactedEmails: count,
  };
}

export async function runGa4Funnel(input: Ga4FunnelInput): Promise<Ga4FunnelResult> {
  const clients = await getGa4Clients();
  if (!clients) throw new Error(GA4_NOT_CONFIGURED);

  const request = await namingPropertyToday(
    () => buildFunnelRequest(input, clients.propertyId),
    clients
  );
  const [response] = await clients.alpha.runFunnelReport(request);
  return shapeFunnelResponse(response);
}

export const ga4FunnelInputSchema: z.ZodType<Ga4FunnelInput> = z.object({
  steps: z
    .array(
      z.object({
        name: z.string().describe('A short label for the step, e.g. "Opened the form"'),
        eventName: z.string().describe('The GA4 event that counts as this step, e.g. page_view'),
        params: z
          .array(
            z.object({
              name: z.string().describe('An event parameter name, e.g. page_location'),
              match: z.enum(['exact', 'contains', 'beginsWith']),
              value: z.string(),
            })
          )
          .optional()
          .describe('Conditions on the event parameters. All of them must match'),
      })
    )
    .min(2)
    .describe('The steps in order'),
  dateRange: z.object({
    startDate: z.string().describe('YYYY-MM-DD. Relative dates are rejected'),
    endDate: z.string().describe('YYYY-MM-DD. Relative dates are rejected'),
  }),
  breakdownDimension: z
    .string()
    .optional()
    .describe('Split every step by a dimension, e.g. deviceCategory'),
  openFunnel: z
    .boolean()
    .optional()
    .describe('True lets people enter at any step. Default false: everyone starts at step one'),
});

export const ga4FunnelTool: ToolSkill = {
  schema: {
    name: 'ga4_funnel',
    description:
      'Run a Google Analytics 4 funnel: how many people reach each step in order, and how many drop out between steps. Steps are events, optionally narrowed by event parameters.',
    input_schema: z.toJSONSchema(ga4FunnelInputSchema) as Record<string, unknown>,
  },

  instructions: `Use this tool to measure drop-off through a sequence of steps, such as opening a donation form and then completing a donation.

Each step is a GA4 event. Narrow a step with "params", which are conditions on the event's parameters: to mean "viewed the donation form", use eventName "page_view" with a page_location parameter that contains the form's address. Use page_location, not pagePath: a funnel step cannot filter on pagePath.

Dates must be absolute (YYYY-MM-DD). Relative dates such as "yesterday" are rejected.

The result has one row per step, with the people who reached it, the share who went on, and those who dropped out. Set breakdownDimension (for example deviceCategory) to split every step by that dimension; the row whose value in that column is "RESERVED_TOTAL" is then the step's total. "sampled" (with "samplingNote") means GA4 estimated the figures from a share of events.`,

  async execute(params) {
    const toolLog = createAiToolLogger('ga4_funnel');
    const start = Date.now();
    const input = params as unknown as Ga4FunnelInput;
    const dates = `${input.dateRange.startDate} to ${input.dateRange.endDate}`;

    try {
      const data = await runGa4Funnel(input);

      toolLog.executed('sitewide', Date.now() - start, data.rows.length);

      return {
        data,
        summary: `${data.rows.length} rows returned for a ${input.steps.length}-step funnel (${dates})${data.sampled ? ' [sampled]' : ''}`,
      };
    } catch (err) {
      toolLog.error('sitewide', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
