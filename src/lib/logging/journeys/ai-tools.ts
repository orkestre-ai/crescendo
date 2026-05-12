/**
 * AI Tool Execution Logger
 *
 * Logs AI tool calls within chat sessions or explorations.
 * Inherits correlation key from parent context (conversationId or explorationId).
 *
 * Correlation key: inherits from parent
 */

import type { Logger } from 'pino';
import { rootLogger } from '../index';

/**
 * Create an AI tool logger. Pass the parent's raw Pino logger
 * to inherit its correlation context (conversationId/explorationId).
 */
export function createAiToolLogger(toolName: string, parentLog?: Logger) {
  const base = parentLog ?? rootLogger;
  const log = base.child({ journey: 'ai-tool', tool: toolName });

  return {
    raw: log,

    executed(pageId: string, durationMs: number, resultRows?: number) {
      log.debug(
        { event: 'ai-tool.executed', pageId, durationMs, resultRows },
        `${toolName}: page=${pageId} (${durationMs}ms)${resultRows != null ? ` → ${resultRows} rows` : ''}`
      );
    },

    error(pageId: string, err: Error) {
      log.error(
        { event: 'ai-tool.error', pageId, err },
        `${toolName} failed for page ${pageId}`
      );
    },

    ga4Query(dateRange: string, metricsRequested: string[], rowsReturned: number) {
      log.debug(
        { event: 'ai-tool.ga4_query', dateRange, metricsRequested, rowsReturned },
        `GA4 query: ${dateRange}, ${metricsRequested.length} metrics → ${rowsReturned} rows`
      );
    },

    snapshotCompare(snapshotCount: number, changesFound: number) {
      log.debug(
        { event: 'ai-tool.snapshot_compare', snapshotCount, changesFound },
        `Snapshot compare: ${snapshotCount} snapshots, ${changesFound} changes`
      );
    },

    sitewideCompare(pagesCompared: number, metricsComputed: number) {
      log.debug(
        { event: 'ai-tool.sitewide_compare', pagesCompared, metricsComputed },
        `Sitewide compare: ${pagesCompared} pages, ${metricsComputed} metrics`
      );
    },

    orgSearch(query: string, resultsFound: number) {
      log.debug(
        { event: 'ai-tool.org_search', query, resultsFound },
        `Org search: "${query}" → ${resultsFound} results`
      );
    },

    pagePerformance(pageId: string, trendDirection: string, dataPoints: number) {
      log.debug(
        { event: 'ai-tool.page_performance', pageId, trendDirection, dataPoints },
        `Page performance: ${pageId} trend=${trendDirection} (${dataPoints} data points)`
      );
    },
  };
}

export type AiToolLogger = ReturnType<typeof createAiToolLogger>;
