/**
 * Engaging Networks Public API Client
 *
 * Provides access to the EN Public Data API for fetching aggregate campaign data,
 * donation summaries, and supporter statistics.
 *
 * Based on: .claude/skills/engaging-networks-public-api/SKILL.md
 */

import {
  NetDonorApiResponse,
  NetDonorApiError,
  FundraisingData,
  normalizeNetDonorResponse,
  FundraisingSummaryByPageResponse,
  FundraisingSummaryData,
  ReportingCurrency,
  normalizeFundraisingSummary,
} from '@/types/fundraising';
import { createApiClientLogger } from '@/lib/logging/journeys';

const netdonorLog = createApiClientLogger('netdonor');

// ============================================================================
// CONFIGURATION
// ============================================================================

type ENRegion = 'us' | 'ca';

const EN_BASE_URLS: Record<ENRegion, string> = {
  us: 'https://us.engagingnetworks.app/ea-dataservice/data.service',
  ca: 'https://ca.engagingnetworks.app/ea-dataservice/data.service',
};

interface ENPublicClientConfig {
  token: string;
  region?: ENRegion;
  timeoutMs?: number;
}

// ============================================================================
// CLIENT CLASS
// ============================================================================

/**
 * Client for Engaging Networks Public Data API
 *
 * Separate from the REST API client as it uses different authentication
 * (query param token vs header token) and different endpoints.
 */
export class ENPublicClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ENPublicClientConfig) {
    this.token = config.token;
    this.baseUrl = EN_BASE_URLS[config.region ?? 'ca'];
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  /**
   * Generic fetch method for EN Public API
   */
  private async fetch<T>(
    service: string,
    params: Record<string, string | number> = {}
  ): Promise<T[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('service', service);
    url.searchParams.set('token', this.token);
    url.searchParams.set('contentType', 'json');

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Handle empty response
      if (!text || text.trim() === '') {
        return [];
      }

      try {
        const data = JSON.parse(text);

        // EN API may return data in two formats:
        // 1. Flat array: [{ field: value, ... }]
        // 2. Nested rows/columns: { rows: [{ columns: [{ name, value }] }] }
        if (data && typeof data === 'object' && 'rows' in data && Array.isArray(data.rows)) {
          // Transform nested format to flat format
          return data.rows.map(
            (row: { columns: Array<{ name: string; value: string; type?: string }> }) => {
              const flatRow: Record<string, any> = {};
              for (const col of row.columns) {
                // Convert string values to appropriate types
                const value = col.value;
                if (col.type === 'xs:int' || col.type === 'xs:integer') {
                  flatRow[col.name] = parseInt(value, 10);
                } else if (
                  col.type === 'xs:decimal' ||
                  col.type === 'xs:double' ||
                  col.type === 'xs:float'
                ) {
                  flatRow[col.name] = parseFloat(value);
                } else {
                  flatRow[col.name] = value;
                }
              }
              return flatRow;
            }
          );
        }

        // EN API returns arrays for all responses
        return Array.isArray(data) ? data : [data];
      } catch {
        // Some error responses may be plain text
        throw new Error(`API returned invalid JSON: ${text.substring(0, 100)}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch NetDonor fundraising summary for a campaign
   *
   * @param campaignId - The EN campaign ID
   * @returns Normalized fundraising data or null if campaign not found/no donations
   * @throws Error if API returns an error or network fails
   */
  async fetchNetDonor(campaignId: number): Promise<FundraisingData | null> {
    const start = performance.now();
    netdonorLog.request('GET', 'NetDonor', { campaignId });

    const response = await this.fetch<NetDonorApiResponse | NetDonorApiError>('NetDonor', {
      campaignId,
      resultType: 'summary',
    });

    // Validate response is an array
    if (!Array.isArray(response)) {
      throw new Error('Invalid response format from EN API');
    }

    // Empty array means campaign not found or no donations
    if (response.length === 0) {
      return null;
    }

    const firstResult = response[0];

    // Validate first result exists
    if (!firstResult || typeof firstResult !== 'object') {
      return null;
    }

    // Check for API-level error
    if ('error' in firstResult && typeof (firstResult as NetDonorApiError).error === 'string') {
      throw new Error(`EN API error: ${(firstResult as NetDonorApiError).error}`);
    }

    // Normalize and return
    const durationMs = performance.now() - start;
    const result = normalizeNetDonorResponse(firstResult as NetDonorApiResponse);
    netdonorLog.netdonorRequest(String(campaignId), durationMs, result ? 1 : 0);
    return result;
  }

  /**
   * Fetch FundraisingSummaryByPage for a specific page and date range
   *
   * Uses the EN Public API FundraisingSummaryByPage service which returns
   * donation counts and amounts by currency for a date range.
   *
   * @param pageId - The EN page builder ID (enPageId)
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   * @param currency - Reporting currency to extract amounts for
   * @returns Normalized fundraising summary data or null if no data
   * @throws Error if API returns an error or network fails
   */
  async fetchFundraisingSummaryByPage(
    pageId: string | number,
    startDate: string,
    endDate: string,
    currency: ReportingCurrency = 'CAD'
  ): Promise<FundraisingSummaryData | null> {
    // EN API requires pageid as integer
    const numericPageId = typeof pageId === 'string' ? parseInt(pageId, 10) : pageId;
    if (isNaN(numericPageId)) {
      throw new Error(`Invalid pageId: ${pageId} - must be a number`);
    }

    const summaryStart = performance.now();
    netdonorLog.request('GET', 'FundraisingSummaryByPage', { pageId: numericPageId, startDate, endDate });

    const response = await this.fetch<FundraisingSummaryByPageResponse>(
      'FundraisingSummaryByPage',
      {
        pageid: numericPageId,
        startDate,
        endDate,
      }
    );

    // Validate response is an array
    if (!Array.isArray(response)) {
      throw new Error('Invalid response format from EN API');
    }

    // Empty array means page not found or no donations in date range
    if (response.length === 0) {
      return null;
    }

    const firstResult = response[0];

    // Validate first result exists
    if (!firstResult || typeof firstResult !== 'object') {
      return null;
    }

    // Check for API-level error
    if ('error' in firstResult && typeof (firstResult as any).error === 'string') {
      throw new Error(`EN API error: ${(firstResult as any).error}`);
    }

    // Normalize and return with the specified currency
    const summaryDurationMs = performance.now() - summaryStart;
    netdonorLog.requestCompleted('FundraisingSummaryByPage', 200, summaryDurationMs);
    return normalizeFundraisingSummary(firstResult, currency, startDate, endDate);
  }

  /**
   * Test API connectivity by fetching supporter count
   *
   * @returns true if connection successful
   * @throws Error if connection fails
   */
  async testConnection(): Promise<boolean> {
    const response = await this.fetch<{ supporterCount: number; clientId: number }>(
      'EaSupporterCount'
    );

    if (!Array.isArray(response)) {
      throw new Error('Invalid response format from EN API');
    }

    if (response.length === 0) {
      throw new Error('Empty response from EN API');
    }

    const firstResult = response[0];

    // Check for error response
    if (firstResult && typeof firstResult === 'object' && 'error' in firstResult) {
      throw new Error(`EN API error: ${(firstResult as any).error}`);
    }

    // Verify we got valid supporter count data
    // API may return supporterCount or SUPPORTER_COUNT depending on version
    const supporterCount =
      (firstResult as any).supporterCount ??
      (firstResult as any).SUPPORTER_COUNT ??
      (firstResult as any).count;

    if (supporterCount === undefined) {
      throw new Error('Invalid supporter count response');
    }

    return true;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let clientInstance: ENPublicClient | null = null;

/**
 * Get or create the EN Public API client singleton
 *
 * Uses env vars for synchronous access (hot path during job processing).
 * For DB-aware initialization, use getENPublicClientAsync().
 *
 * @returns ENPublicClient instance or null if token not configured
 */
export function getENPublicClient(): ENPublicClient | null {
  // Return cached instance
  if (clientInstance) {
    return clientInstance;
  }

  // Check for token (don't use validateEnv() to avoid throwing on missing optional token)
  const token = process.env.EN_PUBLIC_TOKEN;
  if (!token) {
    return null;
  }

  const region = (process.env.EN_REGION as ENRegion) || 'ca';

  clientInstance = new ENPublicClient({
    token,
    region,
    timeoutMs: 30000,
  });

  return clientInstance;
}

/**
 * Get or create the EN Public API client with DB settings fallback
 *
 * Priority: DB-stored token > env var. Resets the cached singleton
 * when DB credentials are available so subsequent sync calls use them.
 *
 * @returns ENPublicClient instance or null if token not configured
 */
export async function getENPublicClientAsync(): Promise<ENPublicClient | null> {
  // Lazy import to avoid circular dependency
  const { getEnPublicToken, getEnRegion } = await import('@/lib/settings');

  const token = await getEnPublicToken();
  if (!token) {
    return null;
  }

  const region = await getEnRegion();

  // Always recreate to pick up any settings changes
  clientInstance = new ENPublicClient({
    token,
    region,
    timeoutMs: 30000,
  });

  return clientInstance;
}

/**
 * Check if EN Public API is configured (sync check — env only)
 */
export function isENPublicConfigured(): boolean {
  return !!process.env.EN_PUBLIC_TOKEN;
}

/**
 * Check if EN Public API is configured (async — includes DB)
 */
export async function isENPublicConfiguredAsync(): Promise<boolean> {
  const { getEnPublicToken } = await import('@/lib/settings');
  const token = await getEnPublicToken();
  return !!token;
}

/**
 * Reset the client singleton (for testing or after settings change)
 */
export function resetENPublicClient(): void {
  clientInstance = null;
}
