import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider-v2';
import { decrypt } from '@/lib/crypto';
import { getOrCreateSettings } from '@/lib/settings';
import { rootLogger } from '@/lib/logging';
import { DEFAULT_MODEL_ID, withCurrentDefaults } from './defaults';
import { supportsEffort, type AiEffort } from './effort';
import type { ProviderName, ProviderConfig, AiSurface, AiModelLists } from './types';

const log = rootLogger.child({ module: 'ai-providers' });

/**
 * Normalize an Ollama base URL into root and API forms.
 * Strips trailing slashes and ensures consistent /api suffix handling.
 */
export function normalizeOllamaUrl(raw?: string | null): { root: string; api: string } {
  const clean = (raw || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/api$/, '');
  return { root: clean, api: `${clean}/api` };
}

/**
 * Create a provider model instance for the given provider + model ID.
 * Per-request initialization (not singleton) because API keys are mutable via Settings.
 */
export function getProviderModel(
  provider: ProviderName,
  modelId: string,
  apiKey?: string,
  baseUrl?: string,
) {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: apiKey! })(modelId);
    case 'openai':
      return createOpenAI({ apiKey: apiKey! })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: apiKey! })(modelId);
    case 'ollama':
      return createOllama({ baseURL: baseUrl || 'http://localhost:11434/api' })(modelId);
  }
}

/**
 * Resolve the provider config for a given AI surface (chat, explore, recs).
 * Reads AppSettings, decrypts the relevant API key, and returns a ProviderConfig.
 * Falls back to Anthropic with ANTHROPIC_API_KEY env var per D-02/D-21.
 */
export async function getProviderConfig(
  surface: AiSurface,
  preloaded?: Awaited<ReturnType<typeof getOrCreateSettings>>,
): Promise<ProviderConfig> {
  const settings = preloaded ?? await getOrCreateSettings();

  // Map surface to the correct DB fields
  const providerField = surface === 'chat' ? 'aiChatProvider'
    : surface === 'explore' ? 'aiExploreProvider'
    : 'aiRecsProvider';
  const modelField = surface === 'chat' ? 'aiChatModelId'
    : surface === 'explore' ? 'aiExploreModelId'
    : 'aiRecsModelId';
  const effortField = surface === 'chat' ? 'aiChatEffort'
    : surface === 'explore' ? 'aiExploreEffort'
    : 'aiRecsEffort';

  const provider = (settings[providerField] as ProviderName) || 'anthropic';
  const modelId = (settings[modelField] as string) || DEFAULT_MODEL_ID;

  // Resolve API key based on provider
  const apiKey = await resolveApiKey(provider, settings);
  let baseUrl: string | undefined;
  if (provider === 'ollama') {
    baseUrl = normalizeOllamaUrl(settings.aiOllamaBaseUrl).api;
  }

  const effort = settings[effortField] as AiEffort;

  return { provider, modelId, effort, apiKey, baseUrl };
}

/**
 * Get the model lists from AppSettings, falling back to defaults.
 */
export async function getModelLists(): Promise<AiModelLists> {
  const settings = await getOrCreateSettings();
  return withCurrentDefaults(settings.aiModelLists as AiModelLists | null);
}

/**
 * Resolve the API key for a given provider.
 * Per D-02: Anthropic falls back to ANTHROPIC_API_KEY env var.
 * Per D-21: No env var fallback for other providers.
 */
async function resolveApiKey(
  provider: ProviderName,
  settings: {
    anthropicApiKeyEncrypted: string | null;
    aiOpenaiKeyEncrypted: string | null;
    aiGoogleKeyEncrypted: string | null;
  },
): Promise<string | undefined> {
  switch (provider) {
    case 'anthropic': {
      if (settings.anthropicApiKeyEncrypted) {
        try {
          return decrypt(settings.anthropicApiKeyEncrypted);
        } catch (err) {
          log.error({ err, provider: 'anthropic' }, 'Failed to decrypt Anthropic API key, falling back to env var');
        }
      }
      // Env var fallback per D-02
      return process.env.ANTHROPIC_API_KEY || undefined;
    }
    case 'openai': {
      if (settings.aiOpenaiKeyEncrypted) {
        try {
          return decrypt(settings.aiOpenaiKeyEncrypted);
        } catch (err) {
          log.error({ err, provider: 'openai' }, 'Failed to decrypt OpenAI API key');
        }
      }
      return undefined;
    }
    case 'google': {
      if (settings.aiGoogleKeyEncrypted) {
        try {
          return decrypt(settings.aiGoogleKeyEncrypted);
        } catch (err) {
          log.error({ err, provider: 'google' }, 'Failed to decrypt Google API key');
        }
      }
      return undefined;
    }
    case 'ollama':
      return undefined; // Ollama uses baseUrl, no API key
  }
}

/**
 * Generation settings for a surface. Reasoning effort comes from the saved
 * per-surface setting and is sent only to models that accept it. Recs get a
 * fixed output cap; chat and explore callers pass the Max Response setting.
 * Thinking counts against the output cap.
 */
export function getGenerationOptions(
  config: ProviderConfig,
  surface: AiSurface,
): { maxOutputTokens?: number; providerOptions?: Record<string, Record<string, string>> } {
  const { provider, modelId, effort } = config;
  return {
    ...(surface === 'recs' && { maxOutputTokens: 16000 }),
    ...(supportsEffort(provider, modelId) && {
      providerOptions:
        provider === 'anthropic'
          ? { anthropic: { effort } }
          : { openai: { reasoningEffort: effort } },
    }),
  };
}
