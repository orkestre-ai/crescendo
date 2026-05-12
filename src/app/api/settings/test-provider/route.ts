import { NextRequest, NextResponse } from 'next/server';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { normalizeOllamaUrl } from '@/lib/ai/providers';
import { rootLogger } from '@/lib/logging';

const logger = rootLogger.child({ journey: 'request', route: '/api/settings/test-provider' });

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey, baseUrl } = (await request.json()) as {
      provider: 'anthropic' | 'openai' | 'google' | 'ollama';
      apiKey?: string;
      baseUrl?: string;
    };

    const start = Date.now();

    logger.info({ provider }, 'Testing AI provider connection');

    // Ollama: ping root first, then try /api/tags for model count
    if (provider === 'ollama') {
      const { root, api } = normalizeOllamaUrl(baseUrl);

      // Step 1: confirm Ollama is reachable
      const pingResponse = await fetch(root, { signal: AbortSignal.timeout(5000) });
      if (!pingResponse.ok) {
        return NextResponse.json({
          success: false,
          error: `Ollama not reachable at ${root} (HTTP ${pingResponse.status}).`,
        });
      }

      // Step 2: try /api/tags for model count (graceful fallback)
      let modelCount = 0;
      try {
        const tagsResponse = await fetch(`${api}/tags`, { signal: AbortSignal.timeout(5000) });
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          modelCount = tagsData.models?.length ?? 0;
        }
      } catch {
        // /api/tags failed but Ollama root is reachable — still a success
      }

      return NextResponse.json({
        success: true,
        provider,
        modelCount,
        responseTimeMs: Date.now() - start,
      });
    }

    // Non-Ollama providers: test with a lightweight generateText call
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    let model;
    switch (provider) {
      case 'anthropic':
        model = createAnthropic({ apiKey })('claude-haiku-4-5-20251001');
        break;
      case 'openai':
        model = createOpenAI({ apiKey })('gpt-4o-mini');
        break;
      case 'google':
        model = createGoogleGenerativeAI({ apiKey })('gemini-2.5-flash');
        break;
      default:
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    await generateText({
      model,
      prompt: 'Say "ok".',
      maxOutputTokens: 10,
    });

    return NextResponse.json({
      success: true,
      provider,
      responseTimeMs: Date.now() - start,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : new Error(String(err)) }, 'Provider test failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return NextResponse.json({
        success: false,
        error: 'Could not connect. Check that the service is running.',
      });
    }
    return NextResponse.json({
      success: false,
      error: message,
    });
  }
}
