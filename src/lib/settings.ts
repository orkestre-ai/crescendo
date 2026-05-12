import { prisma } from '@/lib/db';
import { encrypt, decrypt, maskApiKey } from '@/lib/crypto';
import { env } from '@/config/env';
import { rootLogger } from '@/lib/logging';
import { Prisma } from '@prisma/client';
import type {
  AppSettings,
  RefreshSchedule,
  ConnectionStatus,
} from '@prisma/client';
import type { SettingsResponse, SettingsUpdateRequest } from '@/types/settings';
import type { ReportingCurrency } from '@/types/fundraising';
import { DEFAULT_CONTEXT_PROFILES, type ContextProfile } from '@/config/ai-profiles';
import { DEFAULT_MODEL_LISTS } from '@/lib/ai/defaults';
import type { AiModelLists } from '@/lib/ai/types';
import type { ProviderName } from '@/lib/ai/types';

const SINGLETON_ID = 'singleton';

/** Decrypt an encrypted key and mask it for display, returning null if empty or '****????' on failure. */
function safeDecryptMask(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return maskApiKey(decrypt(encrypted));
  } catch {
    return '****????';
  }
}

/**
 * Get or create the singleton AppSettings record.
 *
 * Prisma's upsert is not atomic at the DB level — it runs SELECT then
 * INSERT/UPDATE from the client. Two concurrent first-callers against an
 * empty DB both see "row missing", both INSERT, and one crashes with
 * P2002. We catch that and re-read, since by then the row exists.
 */
export async function getOrCreateSettings(): Promise<AppSettings> {
  try {
    return await prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.appSettings.findUniqueOrThrow({ where: { id: SINGLETON_ID } });
    }
    throw e;
  }
}

/**
 * Get the decrypted EN API key, with env var fallback
 * Returns null if no key is configured
 */
export async function getEnApiKey(): Promise<string | null> {
  const settings = await getOrCreateSettings();

  // Priority: DB value > env var
  if (settings.enApiKeyEncrypted) {
    try {
      return decrypt(settings.enApiKeyEncrypted);
    } catch (err) {
      // If decryption fails, fall back to env var
      rootLogger.error({ err, event: 'settings.decrypt.failed' }, 'Failed to decrypt stored EN API key');
    }
  }

  return env.EN_API_TOKEN || null;
}

/**
 * Get the decrypted EN Public API token, with env var fallback
 * Returns null if no token is configured
 */
export async function getEnPublicToken(): Promise<string | null> {
  const settings = await getOrCreateSettings();

  if (settings.enPublicTokenEncrypted) {
    try {
      return decrypt(settings.enPublicTokenEncrypted);
    } catch (err) {
      rootLogger.error({ err, event: 'settings.decrypt.failed' }, 'Failed to decrypt stored EN Public token');
    }
  }

  return process.env.EN_PUBLIC_TOKEN || null;
}

/**
 * Get the EN region setting, with env var fallback
 */
export async function getEnRegion(): Promise<'us' | 'ca'> {
  const settings = await getOrCreateSettings();
  const region = settings.enRegion as 'us' | 'ca';
  if (region === 'us' || region === 'ca') return region;
  return (process.env.EN_REGION as 'us' | 'ca') || 'ca';
}

/**
 * Get GA4 credentials, with env var fallback
 * Returns null if no credentials are configured
 */
export async function getGa4Credentials(): Promise<{
  propertyId: string;
  credentials: Record<string, unknown>;
  source: 'database' | 'environment';
} | null> {
  const settings = await getOrCreateSettings();

  // Priority: DB value > env var
  if (settings.ga4PropertyIdEncrypted && settings.ga4ServiceAccountKeyEncrypted) {
    try {
      const propertyId = decrypt(settings.ga4PropertyIdEncrypted);
      const credentials = JSON.parse(decrypt(settings.ga4ServiceAccountKeyEncrypted));
      return { propertyId, credentials, source: 'database' };
    } catch (err) {
      rootLogger.error({ err, event: 'settings.ga4.decrypt.failed' }, 'Failed to decrypt stored GA4 credentials');
    }
  }

  // Fallback to env vars
  const propertyId = process.env.GA4_PROPERTY_ID;
  const keyJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (propertyId && keyJson) {
    try {
      const credentials = JSON.parse(keyJson);
      return { propertyId, credentials, source: 'environment' };
    } catch {
      rootLogger.error({ event: 'settings.ga4.env.parse.failed' }, 'Failed to parse GA4_SERVICE_ACCOUNT_KEY env var');
    }
  }

  return null;
}

/**
 * Get settings formatted for API response (with masked API key)
 */
export async function getSettingsResponse(): Promise<SettingsResponse> {
  const settings = await getOrCreateSettings();
  const localPageCount = settings.localPageCount;

  // Determine if API key is configured
  let hasApiKey = false;
  let apiKeyMasked: string | null = null;

  if (settings.enApiKeyEncrypted) {
    hasApiKey = true;
    apiKeyMasked = safeDecryptMask(settings.enApiKeyEncrypted);
  } else if (env.EN_API_TOKEN) {
    hasApiKey = true;
    apiKeyMasked = maskApiKey(env.EN_API_TOKEN);
  }

  // EN Public API token
  let hasPublicToken = false;
  let publicTokenMasked: string | null = null;
  if (settings.enPublicTokenEncrypted) {
    hasPublicToken = true;
    publicTokenMasked = safeDecryptMask(settings.enPublicTokenEncrypted);
  } else if (process.env.EN_PUBLIC_TOKEN) {
    hasPublicToken = true;
    publicTokenMasked = maskApiKey(process.env.EN_PUBLIC_TOKEN);
  }

  // Calculate next refresh time based on schedule
  const nextRefreshAt = calculateNextRefreshTime(settings.refreshSchedule, settings.lastRefreshAt);

  // Check GA4 configuration (DB > env fallback)
  let isGa4Configured = false;
  let ga4PropertyMasked: string | null = null;
  let ga4ServiceAccountEmail: string | null = null;
  let ga4Source: 'database' | 'environment' | null = null;

  if (settings.ga4PropertyIdEncrypted && settings.ga4ServiceAccountKeyEncrypted) {
    isGa4Configured = true;
    ga4Source = 'database';
    ga4PropertyMasked = safeDecryptMask(settings.ga4PropertyIdEncrypted);
    try {
      const key = JSON.parse(decrypt(settings.ga4ServiceAccountKeyEncrypted));
      ga4ServiceAccountEmail = key.client_email || null;
    } catch {
      ga4ServiceAccountEmail = null;
    }
  } else if (process.env.GA4_PROPERTY_ID && process.env.GA4_SERVICE_ACCOUNT_KEY) {
    isGa4Configured = true;
    ga4Source = 'environment';
    ga4PropertyMasked = `${process.env.GA4_PROPERTY_ID.slice(0, 11)}...`;
    try {
      const key = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY);
      ga4ServiceAccountEmail = key.client_email || null;
    } catch {
      ga4ServiceAccountEmail = null;
    }
  }

  // Check Anthropic configuration
  let anthropicApiKeyMasked: string | null = null;
  let isAnthropicConfigured = false;
  if (settings.anthropicApiKeyEncrypted) {
    isAnthropicConfigured = true;
    anthropicApiKeyMasked = safeDecryptMask(settings.anthropicApiKeyEncrypted);
  } else if (env.ANTHROPIC_API_KEY) {
    isAnthropicConfigured = true;
    anthropicApiKeyMasked = maskApiKey(env.ANTHROPIC_API_KEY);
  }

  return {
    engagingNetworks: {
      hasApiKey,
      apiKeyMasked,
      baseUrl: settings.enBaseUrl,
      connectionStatus: settings.enConnectionStatus,
      lastTestedAt: settings.enLastTestedAt?.toISOString() ?? null,
      lastTestError: settings.enLastTestError,
      pageCount: settings.enPageCount,
      publicApi: {
        hasToken: hasPublicToken,
        tokenMasked: publicTokenMasked,
        region: (settings.enRegion as 'us' | 'ca') || 'ca',
        connectionStatus: settings.enPublicConnectionStatus,
        lastTestedAt: settings.enPublicLastTestedAt?.toISOString() ?? null,
        lastTestError: settings.enPublicLastTestError,
      },
    },
    sync: {
      schedule: settings.refreshSchedule,
      lastRefreshAt: settings.lastRefreshAt?.toISOString() ?? null,
      nextRefreshAt: nextRefreshAt?.toISOString() ?? null,
      lastRefreshJobId: settings.lastRefreshJobId,
      localPageCount,
      behavior: {
        contentScrape: settings.syncContentScrape,
        createSnapshots: settings.syncCreateSnapshots,
        fundraisingData: settings.syncFundraisingData,
        fillGaps: settings.syncFillGaps,
        includeNonLive: settings.syncIncludeNonLive,
      },
      scraping: {
        enabled: settings.scrapingEnabled,
        stalenessThresholdDays: settings.stalenessThresholdDays,
        depth: {
          pageContent: settings.depthPageContent,
          screenshots: settings.depthScreenshots,
          consoleErrors: settings.depthConsoleErrors,
          donationAmounts: settings.depthDonationAmounts,
        },
      },
    },
    ai: {
      model: settings.aiModel,
      systemPrompt: settings.aiSystemPrompt,
      explorationSystemPrompt: settings.aiExplorationSystemPrompt,
      userPromptTemplate: settings.aiUserPromptTemplate,
      contextProfiles:
        (settings.aiContextProfiles as ContextProfile[] | null) ?? DEFAULT_CONTEXT_PROFILES,
      chatModel: settings.aiChatModel,
      chatMaxContext: settings.aiChatMaxContext,
      chatMaxTokens: settings.aiChatMaxTokens,
      chatSystemPrompt: settings.aiChatSystemPrompt,
      orgSearchDomains: settings.aiOrgSearchDomains,
    },
    googleAnalytics: {
      isConfigured: isGa4Configured,
      propertyId: ga4PropertyMasked,
      serviceAccountEmail: ga4ServiceAccountEmail,
      connectionStatus: settings.ga4ConnectionStatus,
      lastTestedAt: settings.ga4LastTestedAt?.toISOString() ?? null,
      lastTestError: settings.ga4LastTestError,
      source: ga4Source,
    },
    reporting: {
      currency: (settings.reportingCurrency as ReportingCurrency) || 'CAD',
    },
    anthropic: {
      isConfigured: isAnthropicConfigured,
      apiKeyMasked: anthropicApiKeyMasked,
    },
    providers: {
      anthropic: {
        isConfigured: isAnthropicConfigured,
        apiKeyMasked: anthropicApiKeyMasked,
        hasEnvFallback: !!process.env.ANTHROPIC_API_KEY,
      },
      openai: {
        isConfigured: !!settings.aiOpenaiKeyEncrypted,
        apiKeyMasked: safeDecryptMask(settings.aiOpenaiKeyEncrypted),
      },
      google: {
        isConfigured: !!settings.aiGoogleKeyEncrypted,
        apiKeyMasked: safeDecryptMask(settings.aiGoogleKeyEncrypted),
      },
      ollama: {
        isConfigured: !!settings.aiOllamaBaseUrl,
        baseUrl: settings.aiOllamaBaseUrl,
      },
      modelLists: (settings.aiModelLists as AiModelLists | null) ?? DEFAULT_MODEL_LISTS,
      chatProvider: settings.aiChatProvider,
      chatModelId: settings.aiChatModelId,
      exploreProvider: settings.aiExploreProvider,
      exploreModelId: settings.aiExploreModelId,
      recsProvider: settings.aiRecsProvider,
      recsModelId: settings.aiRecsModelId,
    },
  };
}

/**
 * Update settings from API request
 */
export async function updateSettings(data: SettingsUpdateRequest): Promise<AppSettings> {
  const updateData: Record<string, unknown> = {};

  if (data.enApiKey !== undefined) {
    updateData.enApiKeyEncrypted =
      data.enApiKey === '' || data.enApiKey === null ? null : encrypt(data.enApiKey);
  }

  if (data.enBaseUrl !== undefined) updateData.enBaseUrl = data.enBaseUrl;
  if (data.enPublicToken !== undefined) {
    updateData.enPublicTokenEncrypted =
      data.enPublicToken === '' || data.enPublicToken === null ? null : encrypt(data.enPublicToken);
  }
  if (data.enRegion !== undefined) updateData.enRegion = data.enRegion;
  if (data.refreshSchedule !== undefined) updateData.refreshSchedule = data.refreshSchedule;

  if (data.syncBehavior !== undefined) {
    if (data.syncBehavior.contentScrape !== undefined)
      updateData.syncContentScrape = data.syncBehavior.contentScrape;
    if (data.syncBehavior.createSnapshots !== undefined)
      updateData.syncCreateSnapshots = data.syncBehavior.createSnapshots;
    if (data.syncBehavior.fundraisingData !== undefined)
      updateData.syncFundraisingData = data.syncBehavior.fundraisingData;
    if (data.syncBehavior.fillGaps !== undefined)
      updateData.syncFillGaps = data.syncBehavior.fillGaps;
    if (data.syncBehavior.includeNonLive !== undefined)
      updateData.syncIncludeNonLive = data.syncBehavior.includeNonLive;
  }

  if (data.scrapingEnabled !== undefined) updateData.scrapingEnabled = data.scrapingEnabled;
  if (data.stalenessThresholdDays !== undefined) updateData.stalenessThresholdDays = data.stalenessThresholdDays;

  if (data.contentDepth !== undefined) {
    if (data.contentDepth.screenshots !== undefined)
      updateData.depthScreenshots = data.contentDepth.screenshots;
    if (data.contentDepth.consoleErrors !== undefined)
      updateData.depthConsoleErrors = data.contentDepth.consoleErrors;
    if (data.contentDepth.donationAmounts !== undefined)
      updateData.depthDonationAmounts = data.contentDepth.donationAmounts;
  }

  if (data.aiModel !== undefined) updateData.aiModel = data.aiModel;
  if (data.aiSystemPrompt !== undefined) updateData.aiSystemPrompt = data.aiSystemPrompt;
  if (data.aiExplorationSystemPrompt !== undefined)
    updateData.aiExplorationSystemPrompt = data.aiExplorationSystemPrompt;
  if (data.aiUserPromptTemplate !== undefined)
    updateData.aiUserPromptTemplate = data.aiUserPromptTemplate;
  if (data.aiContextProfiles !== undefined) updateData.aiContextProfiles = data.aiContextProfiles;
  if (data.aiChatModel !== undefined) updateData.aiChatModel = data.aiChatModel;
  if (data.aiChatMaxContext !== undefined) updateData.aiChatMaxContext = data.aiChatMaxContext;
  if (data.aiChatMaxTokens !== undefined) updateData.aiChatMaxTokens = data.aiChatMaxTokens;
  if (data.aiChatSystemPrompt !== undefined) updateData.aiChatSystemPrompt = data.aiChatSystemPrompt;
  if (data.aiOrgSearchDomains !== undefined) updateData.aiOrgSearchDomains = data.aiOrgSearchDomains;
  if (data.reportingCurrency !== undefined) updateData.reportingCurrency = data.reportingCurrency;
  if (data.anthropicApiKey !== undefined) {
    updateData.anthropicApiKeyEncrypted = data.anthropicApiKey
      ? encrypt(data.anthropicApiKey)
      : null;
  }
  if (data.openaiApiKey !== undefined) {
    updateData.aiOpenaiKeyEncrypted = data.openaiApiKey ? encrypt(data.openaiApiKey) : null;
  }
  if (data.googleApiKey !== undefined) {
    updateData.aiGoogleKeyEncrypted = data.googleApiKey ? encrypt(data.googleApiKey) : null;
  }
  if (data.ollamaBaseUrl !== undefined) {
    updateData.aiOllamaBaseUrl = data.ollamaBaseUrl || null;
  }
  if (data.aiChatProvider !== undefined) updateData.aiChatProvider = data.aiChatProvider;
  if (data.aiChatModelId !== undefined) updateData.aiChatModelId = data.aiChatModelId;
  if (data.aiExploreProvider !== undefined) updateData.aiExploreProvider = data.aiExploreProvider;
  if (data.aiExploreModelId !== undefined) updateData.aiExploreModelId = data.aiExploreModelId;
  if (data.aiRecsProvider !== undefined) updateData.aiRecsProvider = data.aiRecsProvider;
  if (data.aiRecsModelId !== undefined) updateData.aiRecsModelId = data.aiRecsModelId;
  if (data.aiModelLists !== undefined) updateData.aiModelLists = data.aiModelLists;

  if (data.ga4PropertyId !== undefined) {
    updateData.ga4PropertyIdEncrypted = data.ga4PropertyId
      ? encrypt(data.ga4PropertyId)
      : null;
  }
  if (data.ga4ServiceAccountKey !== undefined) {
    updateData.ga4ServiceAccountKeyEncrypted = data.ga4ServiceAccountKey
      ? encrypt(data.ga4ServiceAccountKey)
      : null;
  }

  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: updateData,
    create: { id: SINGLETON_ID, ...updateData },
  });
}

/**
 * Update connection status for EN
 */
export async function updateEnConnectionStatus(
  status: ConnectionStatus,
  error?: string | null,
  pageCount?: number | null
): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      enConnectionStatus: status,
      enLastTestedAt: new Date(),
      enLastTestError: error ?? null,
      enPageCount: pageCount ?? undefined,
    },
    create: {
      id: SINGLETON_ID,
      enConnectionStatus: status,
      enLastTestedAt: new Date(),
      enLastTestError: error ?? null,
      enPageCount: pageCount ?? undefined,
    },
  });
}

/**
 * Update connection status for EN Public API
 */
export async function updateEnPublicConnectionStatus(
  status: ConnectionStatus,
  error?: string | null
): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      enPublicConnectionStatus: status,
      enPublicLastTestedAt: new Date(),
      enPublicLastTestError: error ?? null,
    },
    create: {
      id: SINGLETON_ID,
      enPublicConnectionStatus: status,
      enPublicLastTestedAt: new Date(),
      enPublicLastTestError: error ?? null,
    },
  });
}

/**
 * Update connection status for GA4
 */
export async function updateGa4ConnectionStatus(
  status: ConnectionStatus,
  error?: string | null
): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      ga4ConnectionStatus: status,
      ga4LastTestedAt: new Date(),
      ga4LastTestError: error ?? null,
    },
    create: {
      id: SINGLETON_ID,
      ga4ConnectionStatus: status,
      ga4LastTestedAt: new Date(),
      ga4LastTestError: error ?? null,
    },
  });
}

/**
 * Update last refresh timestamp
 */
export async function updateLastRefresh(jobId: string): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      lastRefreshAt: new Date(),
      lastRefreshJobId: jobId,
    },
    create: {
      id: SINGLETON_ID,
      lastRefreshAt: new Date(),
      lastRefreshJobId: jobId,
    },
  });
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      enApiKeyEncrypted: null,
      enBaseUrl: 'https://ca.engagingnetworks.app/ens/service',
      enConnectionStatus: 'UNKNOWN',
      enLastTestedAt: null,
      enLastTestError: null,
      enPageCount: null,
      refreshSchedule: 'ON_DEMAND',
      lastRefreshAt: null,
      lastRefreshJobId: null,
      syncContentScrape: true,
      syncCreateSnapshots: true,
      syncFundraisingData: true,
      syncFillGaps: true,
      syncIncludeNonLive: false,
      depthPageContent: true,
      depthScreenshots: true,
      depthConsoleErrors: true,
      depthDonationAmounts: true,
      scrapingEnabled: true,
      stalenessThresholdDays: 14,
      scrapingTimeoutMs: 30000,
      aiModel: 'claude-haiku-4-5-20251001',
      aiSystemPrompt: null,
      aiExplorationSystemPrompt: null,
      aiUserPromptTemplate: null,
      enPublicTokenEncrypted: null,
      enRegion: 'ca',
      enPublicConnectionStatus: 'UNKNOWN',
      enPublicLastTestedAt: null,
      enPublicLastTestError: null,
      ga4PropertyIdEncrypted: null,
      ga4ServiceAccountKeyEncrypted: null,
      ga4ConnectionStatus: 'UNKNOWN',
      ga4LastTestedAt: null,
      ga4LastTestError: null,
    },
    create: { id: SINGLETON_ID },
  });
}

/**
 * Calculate next scheduled refresh time based on schedule and last refresh
 */
function calculateNextRefreshTime(
  schedule: RefreshSchedule,
  lastRefreshAt: Date | null
): Date | null {
  if (schedule === 'ON_DEMAND') {
    return null;
  }

  const base = lastRefreshAt || new Date();
  const next = new Date(base);

  switch (schedule) {
    case 'HOURLY':
      next.setHours(next.getHours() + 1);
      break;
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 0, 0); // 6 AM
      break;
    case 'WEEKLY':
      // Find next Monday at 6 AM
      const dayOfWeek = next.getDay(); // 0 = Sunday, 1 = Monday, ...
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(6, 0, 0, 0); // 6 AM
      break;
  }

  return next;
}

/**
 * Check if refresh should run based on schedule
 */
export async function shouldRunScheduledRefresh(): Promise<boolean> {
  const settings = await getOrCreateSettings();

  if (settings.refreshSchedule === 'ON_DEMAND') {
    return false;
  }

  if (!settings.lastRefreshAt) {
    return true; // Never refreshed, should run
  }

  const now = new Date();
  const lastRefresh = settings.lastRefreshAt;
  const hoursSinceLast = (now.getTime() - lastRefresh.getTime()) / (1000 * 60 * 60);

  switch (settings.refreshSchedule) {
    case 'HOURLY':
      return hoursSinceLast >= 1;
    case 'DAILY':
      return hoursSinceLast >= 24;
    case 'WEEKLY':
      return hoursSinceLast >= 168; // 7 * 24
    default:
      return false;
  }
}

/**
 * Get scraping settings for job processing
 */
export async function getScrapingSettings(): Promise<{
  enabled: boolean;
  stalenessThresholdDays: number;
  timeoutMs: number;
  depth: {
    pageContent: boolean;
    screenshots: boolean;
    consoleErrors: boolean;
    donationAmounts: boolean;
  };
}> {
  const settings = await getOrCreateSettings();
  return {
    enabled: settings.scrapingEnabled,
    stalenessThresholdDays: settings.stalenessThresholdDays,
    timeoutMs: settings.scrapingTimeoutMs,
    depth: {
      pageContent: settings.depthPageContent,
      screenshots: settings.depthScreenshots,
      consoleErrors: settings.depthConsoleErrors,
      donationAmounts: settings.depthDonationAmounts,
    },
  };
}

/**
 * Get sync behavior settings for job processing
 */
export async function getSyncBehavior(): Promise<{
  contentScrape: boolean;
  createSnapshots: boolean;
  fundraisingData: boolean;
  fillGaps: boolean;
  includeNonLive: boolean;
}> {
  const settings = await getOrCreateSettings();
  return {
    contentScrape: settings.syncContentScrape,
    createSnapshots: settings.syncCreateSnapshots,
    fundraisingData: settings.syncFundraisingData,
    fillGaps: settings.syncFillGaps,
    includeNonLive: settings.syncIncludeNonLive,
  };
}

/**
 * Get AI configuration settings
 */
export async function getAiSettings(
  preloaded?: Awaited<ReturnType<typeof getOrCreateSettings>>,
): Promise<{
  model: string;
  systemPrompt: string | null;
  explorationSystemPrompt: string | null;
  userPromptTemplate: string | null;
  contextProfiles: ContextProfile[];
  chatModel: string;
  chatMaxContext: number;
  chatMaxTokens: number;
  chatProvider: ProviderName;
  chatModelId: string;
  exploreProvider: ProviderName;
  exploreModelId: string;
  recsProvider: ProviderName;
  recsModelId: string;
}> {
  const settings = preloaded ?? await getOrCreateSettings();
  return {
    model: settings.aiModel,
    systemPrompt: settings.aiSystemPrompt,
    explorationSystemPrompt: settings.aiExplorationSystemPrompt,
    userPromptTemplate: settings.aiUserPromptTemplate,
    contextProfiles:
      (settings.aiContextProfiles as ContextProfile[] | null) ?? DEFAULT_CONTEXT_PROFILES,
    chatModel: settings.aiChatModel,
    chatMaxContext: settings.aiChatMaxContext,
    chatMaxTokens: settings.aiChatMaxTokens,
    // New provider-aware fields
    chatProvider: settings.aiChatProvider as ProviderName,
    chatModelId: settings.aiChatModelId,
    exploreProvider: settings.aiExploreProvider as ProviderName,
    exploreModelId: settings.aiExploreModelId,
    recsProvider: settings.aiRecsProvider as ProviderName,
    recsModelId: settings.aiRecsModelId,
  };
}

/**
 * Get the configured reporting currency from AppSettings
 *
 * @returns The reporting currency (defaults to 'CAD' if not configured)
 */
export async function getReportingCurrency(): Promise<ReportingCurrency> {
  const settings = await getOrCreateSettings();
  return (settings.reportingCurrency as ReportingCurrency) || 'CAD';
}

/**
 * Update the reporting currency setting
 *
 * @param currency - The new reporting currency
 * @returns Updated AppSettings
 */
export async function updateReportingCurrency(currency: ReportingCurrency): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { reportingCurrency: currency },
    create: { id: SINGLETON_ID, reportingCurrency: currency },
  });
}
