import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { env } from '@/config/env';
import { createAiToolLogger } from '@/lib/logging/journeys';
import type { ToolSkill } from './types';

export const ga4QueryTool: ToolSkill = {
  schema: {
    name: 'ga4_query',
    description:
      'Run a custom Google Analytics 4 query with any combination of dimensions and metrics. Returns tabular results for the specified date range.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'GA4 dimension names (e.g., sessionSource, deviceCategory, country, date, pagePath)',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description:
            'GA4 metric names (e.g., sessions, conversions, purchaseRevenue, bounceRate, screenPageViews)',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format or relative like "30daysAgo"',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format or "today"',
        },
        pagePathFilter: {
          type: 'string',
          description: 'Optional: filter results to a specific page path (exact match)',
        },
      },
      required: ['dimensions', 'metrics', 'startDate', 'endDate'],
    },
  },

  instructions: `Use this tool for any GA4 data not available in the pre-loaded metrics: traffic sources, device segmentation, geographic data, user flow, time-series breakdowns.

Always filter to the specific page using pagePathFilter unless the user explicitly asks for sitewide data.

Common dimension/metric combinations:
- Traffic sources: dimensions=["sessionSource","sessionMedium"], metrics=["sessions","conversions","purchaseRevenue"]
- Device breakdown: dimensions=["deviceCategory"], metrics=["sessions","conversions","bounceRate","purchaseRevenue"]
- Geographic: dimensions=["country"], metrics=["sessions","conversions"]
- Daily trend: dimensions=["date"], metrics=["sessions","conversions","purchaseRevenue"]

Results are capped at 100 rows. If you need more granularity, narrow the date range or add filters.`,

  async execute(params) {
    const toolLog = createAiToolLogger('ga4_query');
    const start = Date.now();

    const { dimensions, metrics, startDate, endDate, pagePathFilter } = params as {
      dimensions: string[];
      metrics: string[];
      startDate: string;
      endDate: string;
      pagePathFilter?: string;
    };

    try {
      const credentials = env.GA4_SERVICE_ACCOUNT_KEY;
      const client = new BetaAnalyticsDataClient({ credentials });

      const dimensionFilter = pagePathFilter
        ? {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS' as const, value: pagePathFilter },
            },
          }
        : undefined;

      const [response] = await client.runReport({
        property: env.GA4_PROPERTY_ID,
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        dimensionFilter,
        limit: 100,
      });

      const headers = [
        ...(response.dimensionHeaders || []).map((h) => h.name || ''),
        ...(response.metricHeaders || []).map((h) => h.name || ''),
      ];

      const rows = (response.rows || []).map((row) => {
        const values: Record<string, string> = {};
        (row.dimensionValues || []).forEach((v, i) => {
          values[headers[i]] = v.value || '';
        });
        (row.metricValues || []).forEach((v, i) => {
          values[headers[(row.dimensionValues || []).length + i]] = v.value || '';
        });
        return values;
      });

      const durationMs = Date.now() - start;
      toolLog.ga4Query(`${startDate} to ${endDate}`, metrics, rows.length);
      toolLog.executed(pagePathFilter || 'sitewide', durationMs, rows.length);

      return {
        data: { headers, rows, rowCount: rows.length },
        summary: `${rows.length} rows returned for ${dimensions.join(', ')} x ${metrics.join(', ')} (${startDate} to ${endDate})`,
      };
    } catch (err) {
      toolLog.error(pagePathFilter || 'sitewide', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
};
