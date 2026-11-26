import type { ModelMessage } from 'ai';
import { getContextWindow } from './defaults';
import type { ProviderConfig, ProviderName } from './types';

// Claude models with server-side compaction (beta compact-2026-01-12). Other
// models get their oldest messages dropped instead.
const COMPACTION_MODELS = /^claude-(fable|mythos|opus|sonnet|haiku)-5|^claude-opus-4-[6-9]|^claude-sonnet-4-6/;

export function supportsCompaction(provider: ProviderName, modelId: string): boolean {
  return provider === 'anthropic' && COMPACTION_MODELS.test(modelId);
}

/**
 * Input-token cap for a chat or explore call: the Max Context setting, kept
 * low enough that a full-length reply still fits the model's window.
 */
export function getContextCap(config: ProviderConfig, maxContext: number, maxOutputTokens: number): number {
  const contextWindow = getContextWindow(config.provider, config.modelId);
  if (contextWindow === undefined) return maxContext;
  return Math.min(maxContext, Math.floor(contextWindow * 0.95) - maxOutputTokens);
}

/** Compaction summaries arrive as text parts tagged by the Anthropic provider. */
export function isCompactionPart(part: { type: string; providerMetadata?: unknown }): boolean {
  if (part.type !== 'text') return false;
  const meta = part.providerMetadata as { anthropic?: { type?: string } } | undefined;
  return meta?.anthropic?.type === 'compaction';
}

// Rough token count. JSON tool results run denser than prose, so count three
// characters per token rather than four.
function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 3);
}

/**
 * Drop the oldest turns until the estimated input fits the cap. A turn starts
 * at a user message, so tool calls stay with their results and the history
 * still opens with a user message. The latest turn is always kept.
 */
export function trimToContext(
  system: string,
  messages: ModelMessage[],
  cap: number,
): { messages: ModelMessage[]; dropped: number } {
  const sizes = messages.map(estimateTokens);
  let total = estimateTokens(system) + sizes.reduce((a, b) => a + b, 0);
  let start = 0;
  while (total > cap) {
    const next = messages.findIndex((m, i) => i > start && m.role === 'user');
    if (next === -1) break;
    for (let i = start; i < next; i++) total -= sizes[i];
    start = next;
  }
  return { messages: messages.slice(start), dropped: start };
}
