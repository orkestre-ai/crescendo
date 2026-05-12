import type { AiModelLists } from './types';

export const DEFAULT_MODEL_LISTS: AiModelLists = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', isDefault: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', isDefault: true },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', isDefault: true },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', isDefault: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', isDefault: true },
    { id: 'gpt-4.1', label: 'GPT-4.1', isDefault: true },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', isDefault: true },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', isDefault: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', isDefault: true },
  ],
  ollama: [],
};
