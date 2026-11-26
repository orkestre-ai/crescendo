import type { AiModelLists, ProviderName } from './types';

export const DEFAULT_MODEL_LISTS: AiModelLists = {
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', isDefault: true },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', isDefault: true },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', isDefault: true },
  ],
  openai: [
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', isDefault: true },
    { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', isDefault: true },
    { id: 'gpt-6.2-astra', label: 'GPT-6.2 Astra', isDefault: true },
  ],
  google: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', isDefault: true },
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', isDefault: true },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', isDefault: true },
  ],
  ollama: [],
};

/** Model used when a surface has no saved selection. */
export const DEFAULT_MODEL_ID = 'claude-sonnet-5-5';

/**
 * Saved lists override the defaults, so built-in entries from older releases
 * would linger. Rebuild each list from the current defaults plus the models
 * the user added themselves (isDefault: false).
 */
export function withCurrentDefaults(saved: AiModelLists | null | undefined): AiModelLists {
  if (!saved) return DEFAULT_MODEL_LISTS;
  const merged = {} as AiModelLists;
  for (const provider of Object.keys(DEFAULT_MODEL_LISTS) as ProviderName[]) {
    const defaults = DEFAULT_MODEL_LISTS[provider];
    const ids = new Set(defaults.map((m) => m.id));
    const custom = (saved[provider] ?? []).filter((m) => !m.isDefault && !ids.has(m.id));
    merged[provider] = [...defaults, ...custom];
  }
  return merged;
}
