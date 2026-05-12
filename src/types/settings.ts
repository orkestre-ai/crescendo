import type { ConnectionStatus, RefreshSchedule } from '@prisma/client';
import type { ReportingCurrency } from '@/types/fundraising';
import type { ContextProfile } from '@/config/ai-profiles';
import type { AiModelLists } from '@/lib/ai/types';

// Re-export Prisma enums for convenience
export type { ConnectionStatus, RefreshSchedule };
export type { ReportingCurrency };

export interface SettingsResponse {
  engagingNetworks: {
    hasApiKey: boolean;
    apiKeyMasked: string | null;
    baseUrl: string;
    connectionStatus: ConnectionStatus;
    lastTestedAt: string | null;
    lastTestError: string | null;
    pageCount: number | null;
    publicApi: {
      hasToken: boolean;
      tokenMasked: string | null;
      region: 'us' | 'ca';
      connectionStatus: ConnectionStatus;
      lastTestedAt: string | null;
      lastTestError: string | null;
    };
  };
  sync: {
    schedule: RefreshSchedule;
    lastRefreshAt: string | null;
    nextRefreshAt: string | null;
    lastRefreshJobId: string | null;
    localPageCount: number;
    behavior: {
      contentScrape: boolean;
      createSnapshots: boolean;
      fundraisingData: boolean;
      fillGaps: boolean;
      includeNonLive: boolean;
    };
    scraping: {
      enabled: boolean;
      stalenessThresholdDays: number;
      depth: {
        pageContent: boolean;
        screenshots: boolean;
        consoleErrors: boolean;
        donationAmounts: boolean;
      };
    };
  };
  ai: {
    model: string;
    systemPrompt: string | null;
    explorationSystemPrompt: string | null;
    userPromptTemplate: string | null;
    contextProfiles: ContextProfile[];
    chatModel: string;
    chatMaxContext: number;
    chatMaxTokens: number;
    chatSystemPrompt: string | null;
    orgSearchDomains: string[];
  };
  googleAnalytics: {
    isConfigured: boolean;
    propertyId: string | null;
    serviceAccountEmail: string | null;
    connectionStatus: ConnectionStatus;
    lastTestedAt: string | null;
    lastTestError: string | null;
    source: 'database' | 'environment' | null;
  };
  reporting: {
    currency: ReportingCurrency;
  };
  anthropic: {
    isConfigured: boolean;
    apiKeyMasked: string | null;
  };
  providers: {
    anthropic: {
      isConfigured: boolean;
      apiKeyMasked: string | null;
      hasEnvFallback: boolean;
    };
    openai: {
      isConfigured: boolean;
      apiKeyMasked: string | null;
    };
    google: {
      isConfigured: boolean;
      apiKeyMasked: string | null;
    };
    ollama: {
      isConfigured: boolean;
      baseUrl: string | null;
    };
    modelLists: AiModelLists;
    chatProvider: string;
    chatModelId: string;
    exploreProvider: string;
    exploreModelId: string;
    recsProvider: string;
    recsModelId: string;
  };
}

export interface SettingsUpdateRequest {
  enApiKey?: string;
  enBaseUrl?: string;
  enPublicToken?: string;
  enRegion?: 'us' | 'ca';
  ga4PropertyId?: string;
  ga4ServiceAccountKey?: string;
  refreshSchedule?: RefreshSchedule;
  syncBehavior?: {
    contentScrape?: boolean;
    createSnapshots?: boolean;
    fundraisingData?: boolean;
    fillGaps?: boolean;
    includeNonLive?: boolean;
  };
  scrapingEnabled?: boolean;
  stalenessThresholdDays?: number;
  contentDepth?: {
    screenshots?: boolean;
    consoleErrors?: boolean;
    donationAmounts?: boolean;
  };
  aiModel?: string;
  aiSystemPrompt?: string | null;
  aiExplorationSystemPrompt?: string | null;
  aiUserPromptTemplate?: string | null;
  aiContextProfiles?: ContextProfile[];
  aiChatModel?: string;
  aiChatMaxContext?: number;
  aiChatMaxTokens?: number;
  aiChatSystemPrompt?: string | null;
  aiOrgSearchDomains?: string[];
  reportingCurrency?: ReportingCurrency;
  anthropicApiKey?: string;
  // Multi-provider fields
  openaiApiKey?: string;
  googleApiKey?: string;
  ollamaBaseUrl?: string;
  aiChatProvider?: string;
  aiChatModelId?: string;
  aiExploreProvider?: string;
  aiExploreModelId?: string;
  aiRecsProvider?: string;
  aiRecsModelId?: string;
  aiModelLists?: AiModelLists;
}

export interface ConnectionTestResult {
  success: boolean;
  status: ConnectionStatus;
  message?: string;
  details?: {
    accountName?: string;
    pageCount?: number;
    responseTimeMs?: number;
  };
}

export interface SyncJobResponse {
  jobId: string;
  status: string;
  message?: string;
}

export interface ClearDataRequest {
  categories: ('pages' | 'recommendations' | 'settings')[];
  confirmed: boolean;
}

export interface ClearDataResult {
  success: boolean;
  cleared: {
    pages?: number;
    snapshots?: number;
    recommendations?: number;
    settingsReset?: boolean;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
