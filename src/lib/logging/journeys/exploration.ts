/**
 * Exploration Journey Logger
 *
 * Logs exploration run lifecycle: start, tool calls, insight persistence,
 * and LLM telemetry.
 *
 * Correlation key: explorationId
 */

import { rootLogger } from '../index';

export function createExplorationLogger(explorationId: string, pageId: string, model?: string) {
  const log = rootLogger.child({ journey: 'exploration', explorationId, pageId, model });

  return {
    raw: log,

    // ─── Console Events (INFO+) ──────────────────────────────────

    started(pageName: string, prompt: string, toolCount: number) {
      const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt;
      log.info(
        { event: 'exploration.started', pageName, toolCount },
        `Explore → "${pageName}" — "${shortPrompt}" (${toolCount} tools)`
      );
    },

    completed(outputTokens: number, toolCallCount: number, durationMs: number) {
      const secs = (durationMs / 1000).toFixed(1);
      log.info(
        { event: 'exploration.completed', outputTokens, toolCallCount, durationMs },
        `✓ Explore complete — ${outputTokens.toLocaleString()} tokens out, ${toolCallCount} tool calls (${secs}s)`
      );
    },

    error(reason: string, err?: Error) {
      log.error(
        { event: 'exploration.error', err },
        `✗ Explore failed — "${reason}"`
      );
    },

    // ─── Detail Events (DEBUG) ───────────────────────────────────

    config(templateKey: string, selectedTools: string[], profile: string) {
      log.debug(
        { event: 'exploration.config', templateKey, selectedTools, model, profile },
        `Config: template=${templateKey}, tools=${selectedTools.join(',')}, profile=${profile}`
      );
    },

    toolCalled(toolName: string, params?: Record<string, unknown>) {
      log.debug(
        { event: 'exploration.tool.called', toolName, params },
        `Tool called: ${toolName}`
      );
    },

    toolCompleted(toolName: string, durationMs: number) {
      log.debug(
        { event: 'exploration.tool.completed', toolName, durationMs },
        `Tool completed: ${toolName} (${durationMs}ms)`
      );
    },

    insightPersisted(insightId: string) {
      log.debug(
        { event: 'exploration.insight.persisted', insightId },
        `Insight persisted: ${insightId}`
      );
    },

    insightPersistFailed(err: Error) {
      log.error(
        { event: 'exploration.insight.persist_failed', err },
        `Failed to persist exploration insight`
      );
    },
  };
}

export type ExplorationLogger = ReturnType<typeof createExplorationLogger>;
