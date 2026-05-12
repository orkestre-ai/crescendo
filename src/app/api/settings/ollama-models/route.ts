import { NextResponse } from 'next/server';
import { getOrCreateSettings } from '@/lib/settings';
import { normalizeOllamaUrl } from '@/lib/ai/providers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/ollama-models' });

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    const { api: ollamaApi } = normalizeOllamaUrl(settings.aiOllamaBaseUrl);

    // Ollama tags endpoint returns list of pulled models
    const response = await fetch(`${ollamaApi}/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = (await response.json()) as {
      models?: Array<{ name: string; size: number }>;
    };
    const models = (data.models || []).map((m) => ({
      id: m.name,
      label: m.name,
      isDefault: false,
    }));

    return NextResponse.json({ success: true, models });
  } catch (err) {
    logger.error({ err: err as Error }, 'Failed to fetch Ollama models');
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed') ||
      message.includes('abort')
    ) {
      return NextResponse.json({
        success: false,
        error: 'Could not connect to Ollama. Check that Ollama is running.',
        models: [],
      });
    }
    return NextResponse.json({
      success: false,
      error: message,
      models: [],
    });
  }
}
