/**
 * Usage data from AI completions.
 * Extracted from the deprecated ai-stream.ts to be shared across components.
 */
export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  model: string;
  contextUsed: number;
  contextMax: number;
  toolCallCount: number;
  conversationId?: string;
}
