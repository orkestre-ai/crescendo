/**
 * Chat Journey Logger
 *
 * Logs chat session lifecycle: request start, tool calls, completion,
 * and LLM telemetry (tokens, latency).
 *
 * Correlation key: conversationId
 */

import { rootLogger } from '../index';

export function createChatLogger(conversationId: string, pageId: string, model?: string) {
  const log = rootLogger.child({ journey: 'chat', conversationId, pageId, model });

  return {
    raw: log,

    // ─── Console Events (INFO+) ──────────────────────────────────

    request(pageName: string, messageCount: number) {
      log.info(
        { event: 'chat.request', pageName, messageCount },
        `Chat → "${pageName}" (${model ?? 'unknown'}) — ${messageCount} messages`
      );
    },

    completed(outputTokens: number, toolCallCount: number, durationMs: number) {
      const secs = (durationMs / 1000).toFixed(1);
      log.info(
        { event: 'chat.completed', outputTokens, toolCallCount, durationMs },
        `✓ Chat response — ${outputTokens} tokens out, ${toolCallCount} tool calls (${secs}s)`
      );
    },

    error(reason: string, provider?: string, err?: Error) {
      log.error(
        { event: 'chat.error', err, provider },
        `✗ Chat failed — "${reason}"${provider ? ` (provider: ${provider})` : ''}`
      );
    },

    // ─── Detail Events (DEBUG) ───────────────────────────────────

    contextLoaded(snapshotCount: number, metricsAvailable: boolean, profile: string) {
      log.debug(
        { event: 'chat.context.loaded', snapshotCount, metricsAvailable, profile },
        `Context loaded: ${snapshotCount} snapshots, metrics=${metricsAvailable}, profile=${profile}`
      );
    },

    conversationCreated(title: string) {
      log.debug(
        { event: 'chat.conversation.created', title },
        `Conversation created: "${title}"`
      );
    },

    conversationResumed(existingMessageCount: number) {
      log.debug(
        { event: 'chat.conversation.resumed', existingMessageCount },
        `Conversation resumed (${existingMessageCount} existing messages)`
      );
    },

    toolCalled(toolName: string, params?: Record<string, unknown>) {
      log.debug(
        { event: 'chat.tool.called', toolName, params },
        `Tool called: ${toolName}`
      );
    },

    toolCompleted(toolName: string, durationMs: number, resultSize?: number) {
      log.debug(
        { event: 'chat.tool.completed', toolName, durationMs, resultSize },
        `Tool completed: ${toolName} (${durationMs}ms)`
      );
    },

    messagesPersisted(inputTokens: number, outputTokens: number) {
      log.debug(
        { event: 'chat.messages.persisted', inputTokens, outputTokens, model },
        `Messages persisted (in=${inputTokens}, out=${outputTokens})`
      );
    },

    persistFailed(err: Error) {
      log.error(
        { event: 'chat.persist.failed', err },
        `Failed to persist chat messages`
      );
    },
  };
}

export type ChatLogger = ReturnType<typeof createChatLogger>;
