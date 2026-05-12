'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { UsageData } from '@/lib/ai-usage-types';

interface AIUsageFooterProps {
  usage: UsageData;
}

export function AIUsageFooter({ usage }: AIUsageFooterProps) {
  // Handle both UsageData shape and raw AI SDK shape (promptTokens/completionTokens)
  const raw = usage as unknown as Record<string, unknown>;
  const inputTokens = usage.inputTokens ?? (raw.promptTokens as number) ?? 0;
  const outputTokens = usage.outputTokens ?? (raw.completionTokens as number) ?? 0;
  const cost = usage.cost ?? 0;
  const toolCallCount = usage.toolCallCount ?? 0;
  const contextUsed = usage.contextUsed ?? 0;
  const contextMax = usage.contextMax ?? 0;

  const contextPercent =
    contextMax > 0 ? Math.round((contextUsed / contextMax) * 100) : 0;

  const modelShort = usage.model
    ? usage.model
        .replace(/^claude-/, '')       // Anthropic: claude-sonnet-4-5 -> sonnet-4-5
        .replace(/^gpt-/, '')          // OpenAI: gpt-4o-mini -> 4o-mini
        .replace(/^gemini-/, '')       // Google: gemini-2.5-flash -> 2.5-flash
        .replace(/-\d{8}$/, '')        // Strip date suffixes (e.g. -20251001)
        .split('/').pop()              // Handle org/model format (e.g. meta-llama/llama3.1)
        ?? usage.model
    : 'unknown';

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t text-xs text-muted-foreground">
      <Badge variant="outline" className="text-xs font-normal">
        {modelShort}
      </Badge>
      <span>{inputTokens.toLocaleString()} in</span>
      <span>/</span>
      <span>{outputTokens.toLocaleString()} out</span>
      {cost > 0 && (
        <span className="text-foreground font-medium">${cost.toFixed(4)}</span>
      )}
      {toolCallCount > 0 && (
        <span>
          {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}
        </span>
      )}
      {contextMax > 0 && (
        <div className="flex items-center gap-1 ml-auto">
          <span className="whitespace-nowrap">{contextPercent}% context</span>
          <Progress value={contextPercent} className="w-16 h-1.5" />
        </div>
      )}
    </div>
  );
}
