export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama';

export interface ModelEntry {
  id: string;
  label: string;
  isDefault: boolean;
}

export type AiModelLists = Record<ProviderName, ModelEntry[]>;

export interface ProviderConfig {
  provider: ProviderName;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export type AiSurface = 'chat' | 'explore' | 'recs';
