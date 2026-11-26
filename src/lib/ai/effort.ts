import type { ProviderName } from './types';

/** Reasoning-effort levels accepted by both Anthropic (`effort`) and OpenAI (`reasoningEffort`). */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiEffort = (typeof EFFORT_LEVELS)[number];

// Models that accept a reasoning-effort setting. Older models reject it
// (Claude Haiku/Sonnet 4.5) or ignore it (non-reasoning GPT models). Google
// and Ollama models run with their own default.
const EFFORT_MODELS: Partial<Record<ProviderName, RegExp>> = {
  anthropic: /^claude-(fable|mythos|opus|sonnet|haiku)-5|^claude-opus-4-[5-9]|^claude-sonnet-4-6/,
  openai: /^gpt-[56]/,
};

export function supportsEffort(provider: ProviderName, modelId: string): boolean {
  return EFFORT_MODELS[provider]?.test(modelId) ?? false;
}
