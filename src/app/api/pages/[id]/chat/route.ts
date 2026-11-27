import { NextRequest, NextResponse } from 'next/server';
import { streamText, type UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { prisma } from '@/lib/db';
import { getAiSettings, getOrCreateSettings } from '@/lib/settings';
import { getProfileById } from '@/config/ai-profiles';
import { getToolInstructions, getTools } from '@/lib/ai/tools';
import {
  contextFullStop,
  getGenerationOptions,
  getProviderConfig,
  getProviderModel,
} from '@/lib/ai/providers';
import { getContextCap, isCompactionPart, supportsCompaction, trimToContext } from '@/lib/ai/context';
import { DEFAULT_CHAT_SYSTEM_PROMPT } from '@/config/ai-defaults';
import { DEFAULT_TOOL_KEYS } from '@/config/exploration-constants';
import { createChatLogger } from '@/lib/logging/journeys';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { messages, conversationId: incomingConversationId, title } = body as {
      messages: UIMessage[];
      conversationId?: string;
      title?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
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

    // Fetch settings once, pass to both getAiSettings and getProviderConfig
    const settings = await getOrCreateSettings();
    const aiSettings = await getAiSettings(settings);
    const profile = getProfileById(aiSettings.contextProfiles, page.aiProfileId);

    // Pre-compute metrics
    const last7 = page.snapshots.slice(0, 7);
    const last30 = page.snapshots;
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
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

    const chatBasePrompt = settings.aiChatSystemPrompt || DEFAULT_CHAT_SYSTEM_PROMPT;

    const systemPrompt = [
      chatBasePrompt,
      `\n\n## Context Profile: ${profile.name}\n${profile.context}`,
      `\n\n## Page Information\n- Page ID: ${page.id}\n- Name: ${page.name}\n- URL: ${page.url}`,
      latestContent
        ? `\n- Title: ${latestContent.metaTitle || 'N/A'}\n- Appeal: ${latestContent.appealText?.substring(0, 500) || 'N/A'}`
        : '',
      page.ctaButtons.length > 0 ? `\n- CTAs: ${page.ctaButtons.join(', ')}` : '',
      page.donationAmounts.length > 0
        ? `\n- Donation Amounts: $${page.donationAmounts.join(', $')}`
        : '',
      metrics7d
        ? `\n\n## Last 7 Days\n- Page Views: ${metrics7d.pageViews}\n- Conversions: ${metrics7d.conversions}\n- Revenue: $${metrics7d.revenue.toFixed(2)}\n- Conversion Rate: ${(metrics7d.conversionRate * 100).toFixed(2)}%\n- Bounce Rate: ${(metrics7d.bounceRate * 100).toFixed(2)}%`
        : '',
      metrics30d
        ? `\n\n## Last 30 Days\n- Page Views: ${metrics30d.pageViews}\n- Conversions: ${metrics30d.conversions}\n- Revenue: $${metrics30d.revenue.toFixed(2)}\n- Conversion Rate: ${(metrics30d.conversionRate * 100).toFixed(2)}%\n- Bounce Rate: ${(metrics30d.bounceRate * 100).toFixed(2)}%`
        : '',
      `\n\n## Available Tools\n${getToolInstructions(DEFAULT_TOOL_KEYS)}`,
      `\n\n## Guardrails\n- You are an expert CRO consultant for nonprofit fundraising pages.\n- Only answer questions related to this page, its performance, optimization, fundraising, and digital marketing.\n- If asked about unrelated topics (weather, sports, coding, etc.), politely decline and redirect to page optimization.\n- Never fabricate data — use the tools to look up real data, or clearly state when you don't have the information.\n- Always ground content suggestions in the organization's actual messaging (use org_search tool when needed).`,
    ].join('');

    // Resolve provider model via the provider factory
    const config = await getProviderConfig('chat', settings);
    if (!config.apiKey && config.provider !== 'ollama') {
      return NextResponse.json(
        { error: `No API key configured for ${config.provider}. Go to Settings to add one.` },
        { status: 503 }
      );
    }
    const model = getProviderModel(config.provider, config.modelId, config.apiKey, config.baseUrl);

    // Keep each call's input under the Max Context cap. Claude summarizes the
    // older conversation server-side (compaction); other models drop the
    // oldest turns here.
    const contextCap = getContextCap(config, aiSettings.chatMaxContext, aiSettings.chatMaxTokens);
    let modelMessages = await convertToModelMessages(messages);
    let droppedMessages = 0;
    if (!supportsCompaction(config.provider, config.modelId)) {
      ({ messages: modelMessages, dropped: droppedMessages } = trimToContext(
        systemPrompt,
        modelMessages,
        contextCap
      ));
    }

    // Create chat journey logger
    const chatLog = createChatLogger(incomingConversationId ?? 'new', id, config.modelId);
    const startTime = Date.now();
    chatLog.request(page.name, messages.length);

    // Extract the last user message text from UIMessage parts
    const lastMsg = messages[messages.length - 1];
    const lastUserMessage = lastMsg?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || '';

    const result = streamText({
      model,
      ...getGenerationOptions(config, 'chat', contextCap),
      maxOutputTokens: aiSettings.chatMaxTokens,
      system: systemPrompt,
      messages: modelMessages,
      tools: getTools(DEFAULT_TOOL_KEYS),
      stopWhen: [stepCountIs(10), contextFullStop(config, aiSettings.chatMaxTokens)],
      onFinish: async ({ steps, usage }) => {
        try {
          // A compaction summary comes back as a text part; keep it out of the
          // reply text and store it so later turns can send it back.
          const lastStep = steps[steps.length - 1];
          const text = (lastStep?.content ?? [])
            .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text' && !isCompactionPart(p))
            .map((p) => p.text)
            .join('');
          const compaction = steps
            .flatMap((s) => s.content)
            .filter((p): p is Extract<typeof p, { type: 'text' }> => isCompactionPart(p))
            .at(-1)?.text;

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

          let convId = incomingConversationId;

          if (!convId) {
            const conv = await prisma.conversation.create({
              data: {
                pageId: id,
                title: title || 'New conversation',
              },
            });
            convId = conv.id;
          } else {
            await prisma.conversation.update({
              where: { id: convId },
              data: { updatedAt: new Date() },
            });
          }

          // Persist message pair in a transaction
          await prisma.$transaction([
            prisma.message.create({
              data: {
                conversationId: convId,
                role: 'user',
                content: lastUserMessage,
              },
            }),
            prisma.message.create({
              data: {
                conversationId: convId,
                role: 'assistant',
                content: text,
                compaction,
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
            }),
          ]);
          chatLog.messagesPersisted(usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);
          chatLog.completed(usage?.outputTokens ?? 0, toolCalls.length, Date.now() - startTime);
        } catch (persistError) {
          chatLog.persistFailed(persistError instanceof Error ? persistError : new Error(String(persistError)));
        }
      },
    });

    // Tell the client when older turns were left out, so it can say so.
    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => (part.type === 'start' ? { droppedMessages } : undefined),
    });
  } catch (error) {
    const chatLog = createChatLogger('unknown', 'unknown');
    chatLog.error(error instanceof Error ? error.message : 'Unknown error', undefined, error instanceof Error ? error : undefined);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `AI provider error: ${message}` }, { status: 500 });
  }
}
