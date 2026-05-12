import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettingsResponse, updateSettings } from '@/lib/settings';
import { rootLogger } from '@/lib/logging';
import type { ErrorResponse } from '@/types/settings';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings' });

const updateSettingsSchema = z.object({
  enApiKey: z.string().optional(),
  enBaseUrl: z.string().url().optional(),
  enPublicToken: z.string().optional(),
  enRegion: z.enum(['us', 'ca']).optional(),
  ga4PropertyId: z.string().optional(),
  ga4ServiceAccountKey: z.string().optional(),
  refreshSchedule: z.enum(['ON_DEMAND', 'HOURLY', 'DAILY', 'WEEKLY']).optional(),
  syncBehavior: z
    .object({
      contentScrape: z.boolean().optional(),
      createSnapshots: z.boolean().optional(),
      fundraisingData: z.boolean().optional(),
      fillGaps: z.boolean().optional(),
      includeNonLive: z.boolean().optional(),
    })
    .optional(),
  scrapingEnabled: z.boolean().optional(),
  stalenessThresholdDays: z.number().int().min(1).max(365).optional(),
  contentDepth: z
    .object({
      screenshots: z.boolean().optional(),
      consoleErrors: z.boolean().optional(),
      donationAmounts: z.boolean().optional(),
    })
    .optional(),
  aiModel: z.string().optional(),
  aiSystemPrompt: z.string().nullable().optional(),
  aiExplorationSystemPrompt: z.string().nullable().optional(),
  aiUserPromptTemplate: z.string().nullable().optional(),
  aiContextProfiles: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        context: z.string(),
        isDefault: z.boolean(),
      })
    )
    .optional(),
  aiChatModel: z.string().optional(),
  aiChatMaxContext: z.number().int().min(1000).max(200000).optional(),
  aiChatMaxTokens: z.number().int().min(256).max(8192).optional(),
  aiChatSystemPrompt: z.string().nullable().optional(),
  aiOrgSearchDomains: z.array(z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/, 'Invalid domain format')).max(5).optional(),
  reportingCurrency: z.enum(['USD', 'CAD', 'GBP', 'EUR', 'AUD']).optional(),
  anthropicApiKey: z.string().optional(),
  // Multi-provider fields (Phase 8)
  openaiApiKey: z.string().optional(),
  googleApiKey: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  aiChatProvider: z.enum(['anthropic', 'openai', 'google', 'ollama']).optional(),
  aiChatModelId: z.string().optional(),
  aiExploreProvider: z.enum(['anthropic', 'openai', 'google', 'ollama']).optional(),
  aiExploreModelId: z.string().optional(),
  aiRecsProvider: z.enum(['anthropic', 'openai', 'google', 'ollama']).optional(),
  aiRecsModelId: z.string().optional(),
  aiModelLists: z.object({
    anthropic: z.array(z.object({ id: z.string(), label: z.string(), isDefault: z.boolean() })),
    openai: z.array(z.object({ id: z.string(), label: z.string(), isDefault: z.boolean() })),
    google: z.array(z.object({ id: z.string(), label: z.string(), isDefault: z.boolean() })),
    ollama: z.array(z.object({ id: z.string(), label: z.string(), isDefault: z.boolean() })),
  }).optional(),
});

export async function GET() {
  try {
    const settings = await getSettingsResponse();
    return NextResponse.json(settings);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get settings');
    const errorResponse: ErrorResponse = {
      error: 'SETTINGS_FETCH_ERROR',
      message: 'Failed to retrieve settings',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid settings data',
        details: parsed.error.flatten(),
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    await updateSettings(parsed.data);
    const settings = await getSettingsResponse();

    return NextResponse.json(settings);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to update settings');
    const errorResponse: ErrorResponse = {
      error: 'SETTINGS_UPDATE_ERROR',
      message: 'Failed to update settings',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
