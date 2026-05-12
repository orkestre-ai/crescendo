import { NextRequest, NextResponse } from 'next/server';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { prisma } from '@/lib/db';
import { getAiSettings, getOrCreateSettings } from '@/lib/settings';
import { getProfileById } from '@/config/ai-profiles';
import { getToolInstructions, getTools } from '@/lib/ai/tools';
import { getProviderConfig, getProviderModel } from '@/lib/ai/providers';
import { DEFAULT_EXPLORATION_SYSTEM_PROMPT } from '@/config/ai-defaults';
import { interpolateTemplate } from '@/lib/prompt-utils';
import { resolveDynamicVariables } from '@/lib/ai/dynamic-template-variables';
import { createExplorationLogger } from '@/lib/logging/journeys';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { explorationId } = body as {
      explorationId: string;
    };

    // Per D-17: look up exploration by ID from DB
    const exploration = await prisma.exploration.findUnique({
      where: { id: explorationId },
    });
    if (!exploration) {
      return NextResponse.json(
        { error: 'Exploration not found' },
        { status: 404 }
      );
    }

    const page = await prisma.fundraisingPage.findUnique({
      where: { id },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        contentSnapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const settings = await getOrCreateSettings();
    const aiSettings = await getAiSettings(settings);
    const profile = getProfileById(aiSettings.contextProfiles, page.aiProfileId);

    // Pre-compute 7d and 30d metrics
    const last7 = page.snapshots.slice(0, 7);
    const last30 = page.snapshots;
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    const metrics7d =
      last7.length > 0
        ? {
            pageViews: sum(last7.map((s) => s.pageViews)),
            conversions: sum(last7.map((s) => s.conversions)),
            revenue: sum(last7.map((s) => s.revenue)),
            conversionRate: avg(last7.map((s) => s.conversionRate)),
            bounceRate: avg(last7.map((s) => s.bounceRate)),
          }
        : null;

    const metrics30d =
      last30.length > 0
        ? {
            pageViews: sum(last30.map((s) => s.pageViews)),
            conversions: sum(last30.map((s) => s.conversions)),
            revenue: sum(last30.map((s) => s.revenue)),
            conversionRate: avg(last30.map((s) => s.conversionRate)),
            bounceRate: avg(last30.map((s) => s.bounceRate)),
          }
        : null;

    const latestContent = page.contentSnapshots[0];

    // Per D-02: only describe enabled tools in system prompt
    const enabledTools = exploration.enabledTools;

    // Build template variable map from runtime page/metrics data
    const templateVars: Record<string, string | number | null | undefined> = {
      pageName: page.name,
      pageUrl: page.url,
      pageId: page.id,
      pageTitle: latestContent?.metaTitle ?? page.name,
      appealText: latestContent?.appealText ?? null,
      pageViews7d: metrics7d?.pageViews ?? null,
      conversions7d: metrics7d?.conversions ?? null,
      revenue7d: metrics7d?.revenue != null ? metrics7d.revenue.toFixed(2) : null,
      conversionRate7d:
        metrics7d?.conversionRate != null
          ? (metrics7d.conversionRate * 100).toFixed(2)
          : null,
      bounceRate7d:
        metrics7d?.bounceRate != null ? (metrics7d.bounceRate * 100).toFixed(2) : null,
      pageViews30d: metrics30d?.pageViews ?? null,
      conversions30d: metrics30d?.conversions ?? null,
      revenue30d: metrics30d?.revenue != null ? metrics30d.revenue.toFixed(2) : null,
      conversionRate30d:
        metrics30d?.conversionRate != null
          ? (metrics30d.conversionRate * 100).toFixed(2)
          : null,
      bounceRate30d:
        metrics30d?.bounceRate != null ? (metrics30d.bounceRate * 100).toFixed(2) : null,
    };

    const systemPromptTemplate = aiSettings.explorationSystemPrompt || DEFAULT_EXPLORATION_SYSTEM_PROMPT;
    const systemPromptDynamicResolved = await resolveDynamicVariables(
      systemPromptTemplate,
      { pageId: id, explorationId }
    );
    const systemPrompt = [
      interpolateTemplate(systemPromptDynamicResolved, templateVars),
      `\n\n## Context Profile: ${profile.name}\n${profile.context}`,
      `\n\n## Page Information\n- Page ID: ${page.id}\n- Name: ${page.name}\n- URL: ${page.url}`,
      latestContent
        ? `\n- Title: ${latestContent.metaTitle || 'N/A'}\n- Appeal: ${latestContent.appealText?.substring(0, 500) || 'N/A'}`
        : '',
      metrics7d
        ? `\n\n## Last 7 Days\n- Page Views: ${metrics7d.pageViews}\n- Conversions: ${metrics7d.conversions}\n- Revenue: $${metrics7d.revenue.toFixed(2)}\n- Conversion Rate: ${(metrics7d.conversionRate * 100).toFixed(2)}%\n- Bounce Rate: ${(metrics7d.bounceRate * 100).toFixed(2)}%`
        : '',
      metrics30d
        ? `\n\n## Last 30 Days\n- Page Views: ${metrics30d.pageViews}\n- Conversions: ${metrics30d.conversions}\n- Revenue: $${metrics30d.revenue.toFixed(2)}\n- Conversion Rate: ${(metrics30d.conversionRate * 100).toFixed(2)}%\n- Bounce Rate: ${(metrics30d.bounceRate * 100).toFixed(2)}%`
        : '',
      `\n\n## Available Tools\n${getToolInstructions(enabledTools)}`,
    ].join('');

    // Resolve provider model via the provider factory
    const config = await getProviderConfig('explore', settings);
    if (!config.apiKey && config.provider !== 'ollama') {
      return NextResponse.json(
        { error: `No API key configured for ${config.provider}. Go to Settings to add one.` },
        { status: 503 }
      );
    }
    const model = getProviderModel(
      config.provider,
      config.modelId,
      config.apiKey,
      config.baseUrl
    );

    // Construct a single-message UIMessage array with the interpolated exploration prompt
    const explorationPromptDynamicResolved = await resolveDynamicVariables(
      exploration.prompt,
      { pageId: id, explorationId }
    );
    const interpolatedPrompt = interpolateTemplate(explorationPromptDynamicResolved, templateVars);
    const userMessage = {
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: interpolatedPrompt }],
    };

    const exploreLog = createExplorationLogger(explorationId, id, config.modelId);
    const startTime = Date.now();
    exploreLog.started(page.name, exploration.prompt, enabledTools.length);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages([userMessage]),
      tools: getTools(enabledTools),
      stopWhen: stepCountIs(10),
      onFinish: async ({ text, steps, usage }) => {
        try {
          // Extract tool calls from steps
          const toolCalls = steps.flatMap((step) =>
            (step.toolCalls || []).map((tc) => ({
              tool: tc.toolName,
              params: 'input' in tc ? tc.input : {},
              result: (step.toolResults || []).find(
                (tr) => tr.toolCallId === tc.toolCallId
              )?.output ?? null,
            }))
          );

          // Save as PageInsight with explorationId
          await prisma.pageInsight.create({
            data: {
              pageId: id,
              mode: 'explore',
              explorationId,
              prompt: exploration.prompt,
              response: text,
              toolCalls:
                toolCalls.length > 0
                  ? JSON.parse(JSON.stringify(toolCalls))
                  : undefined,
              usage: {
                model: config.modelId,
                inputTokens: usage?.inputTokens ?? 0,
                outputTokens: usage?.outputTokens ?? 0,
                toolCallCount: toolCalls.length,
              },
            },
          });
          exploreLog.completed(usage?.outputTokens ?? 0, toolCalls.length, Date.now() - startTime);
        } catch (persistError) {
          exploreLog.insightPersistFailed(persistError instanceof Error ? persistError : new Error(String(persistError)));
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const exploreLog = createExplorationLogger('unknown', 'unknown');
    exploreLog.error(error instanceof Error ? error.message : 'Unknown error', error instanceof Error ? error : undefined);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `AI provider error: ${message}` }, { status: 500 });
  }
}
