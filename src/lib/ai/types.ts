import type { AiEffort } from './effort';

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama';

export interface ModelEntry {
  id: string;
  label: string;
  isDefault: boolean;
  /** Total tokens per request (input + output). Unknown for user-added models. */
  contextWindow?: number;
}

export type AiModelLists = Record<ProviderName, ModelEntry[]>;

export interface ProviderConfig {
  provider: ProviderName;
  modelId: string;
  effort: AiEffort;
  apiKey?: string;
  baseUrl?: string;
}

export type AiSurface = 'chat' | 'explore' | 'recs' | 'reports';
