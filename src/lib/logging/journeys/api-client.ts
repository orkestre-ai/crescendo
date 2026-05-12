/**
 * API Client Journey Logger
 *
 * Logs external API calls: EN REST, EN Public (NetDonor), GA4, Claude.
 * Tracks request/response, rate limits, auth, and slow calls.
 *
 * Correlation key: requestId (auto-generated per call)
 */

import { randomUUID } from 'crypto';
import { rootLogger } from '../index';

export function createApiClientLogger(service: string) {
  const log = rootLogger.child({ journey: 'api-client', service });

  return {
    raw: log,

    // ─── Console Events (INFO+) ──────────────────────────────────

    authSuccess(expiresInMinutes?: number) {
      log.info(
        { event: `${service}.auth.success`, expiresInMinutes },
        `${service.toUpperCase()} authenticated${expiresInMinutes ? ` (token expires in ${expiresInMinutes}m)` : ''}`
      );
    },

    authFailed(statusCode: number, err?: Error) {
      log.error(
        { event: `${service}.auth.failed`, statusCode, err },
        `✗ ${service.toUpperCase()} auth failed — ${statusCode}`
      );
    },

    batchCompleted(entityName: string, count: number, queries: number, durationMs: number) {
      const secs = (durationMs / 1000).toFixed(1);
      log.info(
        { event: `${service}.batch.completed`, count, queries, durationMs },
        `✓ ${service.toUpperCase()} batch — ${count} ${entityName}, ${queries} queries (${secs}s)`
      );
    },

    rateLimited(retryAfter: number, endpoint?: string) {
      log.warn(
        { event: `${service}.rate_limited`, retryAfter, endpoint },
        `${service.toUpperCase()} rate limited — retry after ${retryAfter}s${endpoint ? ` (${endpoint})` : ''}`
      );
    },

    noData(entityName: string, entityId: string) {
      log.warn(
        { event: `${service}.no_data`, entityName, entityId },
        `${entityName} "${entityId}" — ${service.toUpperCase()} returned no data`
      );
    },

    slow(endpoint: string, durationMs: number) {
      log.warn(
        { event: 'api.slow', service, endpoint, durationMs },
        `Slow API call: ${service.toUpperCase()} ${endpoint} (${(durationMs / 1000).toFixed(1)}s)`
      );
    },

    // ─── Detail Events (DEBUG) ───────────────────────────────────

    request(method: string, endpoint: string, params?: Record<string, unknown>) {
      const requestId = randomUUID().slice(0, 8);
      log.debug(
        { event: `${service}.request`, requestId, method, endpoint, params },
        `${method} ${endpoint}`
      );
      return requestId;
    },

    requestCompleted(endpoint: string, statusCode: number, durationMs: number) {
      log.debug(
        { event: `${service}.request.completed`, endpoint, statusCode, durationMs },
        `${endpoint} → ${statusCode} (${durationMs}ms)`
      );
    },

    requestFailed(endpoint: string, durationMs: number, err: Error, retryCount?: number) {
      log.error(
        { event: `${service}.request.failed`, endpoint, durationMs, retryCount, err },
        `✗ ${endpoint} failed (${durationMs}ms)${retryCount ? ` retry ${retryCount}` : ''}`
      );
    },

    pagesFetched(pageCount: number, offset: number, hasMore: boolean) {
      log.debug(
        { event: 'en.pages.fetched', pageCount, offset, hasMore },
        `Fetched ${pageCount} pages (offset=${offset}, more=${hasMore})`
      );
    },

    ga4Request(pagePath: string, dateRange: string, durationMs: number, metricsReturned: number) {
      log.debug(
        { event: 'ga4.request', pagePath, dateRange, durationMs, metricsReturned },
        `GA4 ${pagePath} ${dateRange} → ${metricsReturned} metrics (${durationMs}ms)`
      );
    },

    ga4PurchaseData(pagePath: string, conversions: number, revenue: number) {
      log.debug(
        { event: 'ga4.purchase_data', pagePath, conversions, revenue },
        `GA4 purchase: ${pagePath} → ${conversions} conversions, $${revenue}`
      );
    },

    netdonorRequest(campaignId: string, durationMs: number, donationCount: number) {
      log.debug(
        { event: 'netdonor.request', campaignId, durationMs, donationCount },
        `NetDonor campaign ${campaignId} → ${donationCount} donations (${durationMs}ms)`
      );
    },

    netdonorNoCampaign(pageId: string) {
      log.debug(
        { event: 'netdonor.no_campaign', pageId },
        `Page ${pageId} has no campaign ID — skipped`
      );
    },

    claudeRequest(model: string, inputTokens: number, outputTokens: number, durationMs: number) {
      log.debug(
        { event: 'claude.request', model, inputTokens, outputTokens, durationMs },
        `Claude ${model}: in=${inputTokens} out=${outputTokens} (${durationMs}ms)`
      );
    },

    claudeRecommendationParsed(pageId: string, recCount: number, categories: string[]) {
      log.debug(
        { event: 'claude.recommendation.parsed', pageId, recCount, categories },
        `Parsed ${recCount} recommendations for page ${pageId}`
      );
    },
  };
}

export type ApiClientLogger = ReturnType<typeof createApiClientLogger>;
