import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getGa4Credentials } from '@/lib/settings';
import { createApiClientLogger } from '@/lib/logging/journeys';

const ga4Log = createApiClientLogger('ga4');

export class GoogleAnalyticsClient {
  private client: BetaAnalyticsDataClient;
  private propertyId: string;

  constructor(propertyId: string, credentials: Record<string, unknown>) {
    this.client = new BetaAnalyticsDataClient({ credentials });
    this.propertyId = propertyId;
  }

  /**
   * Extract page ID from EN page path
   * @param pagePath - Path like /page/181859/donate/1
   * @returns Page ID (e.g., "181859") or null if not an EN page
   */
  private extractPageId(pagePath: string): string | null {
    const match = pagePath.match(/\/page\/(\d+)\//);
    return match?.[1] || null;
  }

  /**
   * Get the confirmation page path for revenue tracking
   * EN pages fire purchase events on /donate/2, not /donate/1
   * @param pagePath - Original page path (e.g., /page/181859/donate/1)
   * @returns Confirmation page path (e.g., /page/181859/donate/2)
   */
  private getConfirmationPath(pagePath: string): string {
    const pageId = this.extractPageId(pagePath);
    if (pageId) {
      return `/page/${pageId}/donate/2`;
    }
    return pagePath;
  }

  /**
   * Fetch purchase data (conversions + revenue) from the confirmation page
   * EN donation pages fire purchase events on /donate/2 (confirmation), not /donate/1 (form)
   *
   * We use purchase event count as conversions (not the generic GA4 conversions metric
   * which includes scroll, sign_up, file_download, etc.)
   *
   * @param pagePath - Original page path (e.g., /page/181859/donate/1)
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Purchase count (conversions) and revenue from purchase events
   */
  private async getPagePurchaseData(
    pagePath: string,
    startDate: string,
    endDate: string
  ): Promise<{ conversions: number; revenue: number }> {
    const confirmationPath = this.getConfirmationPath(pagePath);

    // Skip if not an EN page
    if (confirmationPath === pagePath && !pagePath.includes('/donate/')) {
      return { conversions: 0, revenue: 0 };
    }

    const requestBody = {
      property: this.propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'eventCount' }, // Purchase count = conversions
        { name: 'eventValue' }, // Revenue
      ],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { value: 'purchase' },
              },
            },
            {
              filter: {
                fieldName: 'pagePath',
                stringFilter: { value: confirmationPath },
              },
            },
          ],
        },
      },
    };

    ga4Log.raw.debug({ event: 'ga4.purchase.request', endpoint: '/runReport', originalPath: pagePath, confirmationPath, startDate, endDate }, 'GA4 Purchase Data Request');

    try {
      const [response] = await this.client.runReport(requestBody);

      const conversions = parseInt(response.rows?.[0]?.metricValues?.[0]?.value || '0');
      const revenue = parseFloat(response.rows?.[0]?.metricValues?.[1]?.value || '0');

      ga4Log.ga4PurchaseData(confirmationPath, conversions, revenue);

      return { conversions, revenue };
    } catch (error) {
      ga4Log.raw.warn({ event: 'ga4.purchase.failed', err: error instanceof Error ? error : undefined, confirmationPath }, 'Failed to fetch purchase data');
      return { conversions: 0, revenue: 0 };
    }
  }

  async getPageMetrics(
    pagePath: string,
    startDate: string,
    endDate: string
  ): Promise<GA4PageMetrics> {
    // Build the request body for page metrics (without conversions/revenue - from purchase events)
    const requestBody = {
      property: this.propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { value: pagePath },
        },
      },
    };

    // Log the full request body
    ga4Log.request('POST', '/runReport', { pagePath, startDate, endDate });

    // Fetch page metrics and purchase data (conversions + revenue) in parallel
    const [metricsResult, purchaseData] = await Promise.all([
      (async () => {
        const start = performance.now();
        const [response] = await this.client.runReport(requestBody);
        const durationMs = performance.now() - start;

        // Log the response
        ga4Log.ga4Request(pagePath, `${startDate}..${endDate}`, durationMs, response.rows?.length ?? 0);

        const row = response.rows?.[0];
        if (!row || !row.metricValues) {
          return {
            pageViews: 0,
            bounceRate: 0,
            avgSessionDuration: 0,
          };
        }

        return {
          pageViews: parseInt(row.metricValues[0]?.value || '0'),
          bounceRate: parseFloat(row.metricValues[1]?.value || '0'),
          avgSessionDuration: parseFloat(row.metricValues[2]?.value || '0'),
        };
      })(),
      // Fetch conversions + revenue from purchase events on confirmation page
      this.getPagePurchaseData(pagePath, startDate, endDate),
    ]);

    return {
      pagePath,
      ...metricsResult,
      conversions: purchaseData.conversions,
      revenue: purchaseData.revenue,
    };
  }

  async getBatchPageMetrics(
    pages: Array<{ pagePath: string; url: string }>,
    startDate: string,
    endDate: string
  ): Promise<Map<string, GA4PageMetrics>> {
    const results = new Map<string, GA4PageMetrics>();

    ga4Log.request('POST', '/runReport/batch', { pageCount: pages.length, startDate, endDate });

    // GA4 API doesn't support batch requests, so we process sequentially
    // with a small delay to avoid rate limiting
    for (const page of pages) {
      try {
        const metrics = await this.getPageMetrics(page.pagePath, startDate, endDate);
        results.set(page.url, metrics);

        // Small delay to avoid rate limiting (40k requests/day = ~1.6k/hour)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        ga4Log.requestFailed('/runReport', 0, error as Error);

        // Store empty metrics on error
        results.set(page.url, {
          pagePath: page.pagePath,
          pageViews: 0,
          bounceRate: 0,
          conversions: 0,
          revenue: 0,
          avgSessionDuration: 0,
        });
      }
    }

    ga4Log.batchCompleted('pages', results.size, pages.length, 0);
    return results;
  }

  /**
   * Fetch historical purchase data (conversions + revenue) from the confirmation page, by day.
   * EN pages fire purchase events on /donate/2, so we need to fetch this separately.
   *
   * @param pagePath - Original page path (e.g., /page/181859/donate/1)
   * @param startDateStr - Start date (YYYY-MM-DD)
   * @param endDateStr - End date (YYYY-MM-DD)
   * @returns Map of date strings (YYYY-MM-DD) to { conversions, revenue }
   */
  private async getHistoricalPurchaseData(
    pagePath: string,
    startDateStr: string,
    endDateStr: string
  ): Promise<Map<string, { conversions: number; revenue: number }>> {
    const results = new Map<string, { conversions: number; revenue: number }>();
    const confirmationPath = this.getConfirmationPath(pagePath);

    // Skip if not an EN page
    if (confirmationPath === pagePath && !pagePath.includes('/donate/')) {
      return results;
    }

    const requestBody = {
      property: this.propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      metrics: [
        { name: 'eventCount' }, // Purchase count = conversions
        { name: 'eventValue' }, // Revenue
      ],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: 'eventName',
                stringFilter: { value: 'purchase' },
              },
            },
            {
              filter: {
                fieldName: 'pagePath',
                stringFilter: { value: confirmationPath },
              },
            },
          ],
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
    };

    ga4Log.raw.debug({ event: 'ga4.backfill.purchase.request', originalPath: pagePath, confirmationPath, startDate: startDateStr, endDate: endDateStr }, 'GA4 Historical Purchase Data Request');

    try {
      const [response] = await this.client.runReport(requestBody);

      if (response.rows) {
        for (const row of response.rows) {
          const dateRaw = row.dimensionValues?.[0]?.value || '';
          const dateStr = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
          const conversions = parseInt(row.metricValues?.[0]?.value || '0');
          const revenue = parseFloat(row.metricValues?.[1]?.value || '0');
          results.set(dateStr, { conversions, revenue });
        }
      }

      ga4Log.raw.debug({ event: 'ga4.backfill.purchase.response', confirmationPath, daysWithPurchases: results.size }, 'GA4 Historical Purchase Data Response');
    } catch (error) {
      ga4Log.raw.warn({ event: 'ga4.backfill.purchase.failed', err: error instanceof Error ? error : undefined, confirmationPath }, 'Failed to fetch historical purchase data');
    }

    return results;
  }

  /**
   * Fetch historical metrics for a specific date range
   * Used by gap-fill to query specific missing date ranges
   *
   * @param pagePath - The page path to fetch metrics for
   * @param startDateStr - Start date (YYYY-MM-DD)
   * @param endDateStr - End date (YYYY-MM-DD)
   * @returns Map of date strings (YYYY-MM-DD) to metrics
   */
  async getMetricsForDateRange(
    pagePath: string,
    startDateStr: string,
    endDateStr: string
  ): Promise<Map<string, GA4PageMetrics>> {
    const results = new Map<string, GA4PageMetrics>();

    const requestBody = {
      property: this.propertyId,
      dateRanges: [{ startDate: startDateStr, endDate: endDateStr }],
      dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { value: pagePath },
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
    };

    ga4Log.raw.debug({ event: 'ga4.range.started', pagePath, startDate: startDateStr, endDate: endDateStr }, 'Starting GA4 date range query');

    try {
      const [metricsResponse, purchaseByDate] = await Promise.all([
        (async () => {
          const start = performance.now();
          ga4Log.request('POST', '/runReport', { pagePath, startDate: startDateStr, endDate: endDateStr, type: 'range' });
          const result = await this.client.runReport(requestBody);
          const durationMs = performance.now() - start;
          ga4Log.requestCompleted('/runReport', 200, durationMs);
          return result;
        })(),
        this.getHistoricalPurchaseData(pagePath, startDateStr, endDateStr),
      ]);

      const [response] = metricsResponse;

      if (response.rows) {
        for (const row of response.rows) {
          const dateRaw = row.dimensionValues?.[0]?.value || '';
          const dateStr = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
          const purchaseData = purchaseByDate.get(dateStr) || { conversions: 0, revenue: 0 };

          results.set(dateStr, {
            pagePath,
            pageViews: parseInt(row.metricValues?.[0]?.value || '0'),
            bounceRate: parseFloat(row.metricValues?.[1]?.value || '0'),
            conversions: purchaseData.conversions,
            revenue: purchaseData.revenue,
            avgSessionDuration: parseFloat(row.metricValues?.[2]?.value || '0'),
          });
        }
      }

      for (const [dateStr, purchaseData] of purchaseByDate) {
        if (!results.has(dateStr) && (purchaseData.conversions > 0 || purchaseData.revenue > 0)) {
          results.set(dateStr, {
            pagePath,
            pageViews: 0,
            bounceRate: 0,
            conversions: purchaseData.conversions,
            revenue: purchaseData.revenue,
            avgSessionDuration: 0,
          });
        }
      }

      ga4Log.raw.debug({ event: 'ga4.range.completed', pagePath, startDate: startDateStr, endDate: endDateStr, daysWithData: results.size }, 'GA4 date range query completed');
    } catch (error) {
      ga4Log.requestFailed('/runReport', 0, error as Error);
      throw error;
    }

    return results;
  }

  /**
   * Fetch historical metrics for a page, broken down by day.
   * Delegates to getMetricsForDateRange with calculated date boundaries.
   *
   * @param pagePath - The page path to fetch metrics for
   * @param days - Number of days of historical data (default 90)
   * @returns Map of date strings (YYYY-MM-DD) to metrics
   */
  async getHistoricalMetrics(
    pagePath: string,
    days: number = 90
  ): Promise<Map<string, GA4PageMetrics>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    ga4Log.raw.info({ event: 'ga4.backfill.started', pagePath, days, startDate: startDateStr, endDate: endDateStr }, 'Starting GA4 historical backfill');

    const results = await this.getMetricsForDateRange(pagePath, startDateStr, endDateStr);

    ga4Log.raw.info({ event: 'ga4.backfill.completed', pagePath, days, daysWithData: results.size }, 'GA4 historical backfill completed');

    return results;
  }
}

export interface GA4PageMetrics {
  pagePath: string;
  pageViews: number;
  bounceRate: number;
  conversions: number;
  revenue: number;
  avgSessionDuration: number;
}

let cachedClient: GoogleAnalyticsClient | null = null;
let cachedSource: string | null = null;

/**
 * Get a configured GA4 client.
 * Caches the instance for the lifetime of the process, but rebuilds if
 * the credential source changes (e.g., user saves new creds via Settings).
 */
export async function getGa4Client(): Promise<GoogleAnalyticsClient> {
  const creds = await getGa4Credentials();
  if (!creds) {
    throw new Error('GA4 is not configured. Set credentials via Settings or environment variables.');
  }

  // Rebuild if source changed (user saved new DB credentials)
  const sourceKey = `${creds.source}:${creds.propertyId}`;
  if (!cachedClient || cachedSource !== sourceKey) {
    cachedClient = new GoogleAnalyticsClient(creds.propertyId, creds.credentials);
    cachedSource = sourceKey;
  }

  return cachedClient;
}

/**
 * Clear the cached GA4 client. Call after credentials change
 * (e.g., after saving new settings via the wizard).
 */
export function clearGa4ClientCache(): void {
  cachedClient = null;
  cachedSource = null;
}
