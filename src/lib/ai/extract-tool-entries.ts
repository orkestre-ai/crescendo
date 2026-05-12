import type { UIMessage } from 'ai';

export interface ToolEntry {
  id: string;
  messageId: string;
  name: string;
  params?: Record<string, unknown>;
  result?: { summary?: string; data?: unknown; error?: string; [key: string]: unknown };
  status: 'running' | 'done' | 'error';
  expanded: boolean;
}

/**
 * Extract text content from UIMessage parts.
 */
export function extractTextFromParts(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * Extract tool entries from assistant messages.
 * Handles both AI SDK v6 (type "tool-<name>") and v5 (toolName property) formats.
 */
export function extractToolEntries(messages: UIMessage[]): ToolEntry[] {
  const entries: ToolEntry[] = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.parts) {
      const toolName = resolveToolName(part);
      if (toolName && 'toolCallId' in part && 'state' in part) {
        const toolPart = part as {
          toolCallId: string;
          state: string;
          input?: unknown;
          output?: unknown;
        };
        const isResult =
          toolPart.state === 'output-available' || toolPart.state === 'output-error';
        const result = isResult
          ? (toolPart.output as ToolEntry['result']) ?? undefined
          : undefined;
        entries.push({
          id: toolPart.toolCallId,
          messageId: msg.id,
          name: toolName,
          params: (toolPart.input as Record<string, unknown>) ?? undefined,
          result,
          status:
            toolPart.state === 'output-error'
              ? 'error'
              : isResult
                ? result?.error
                  ? 'error'
                  : 'done'
                : 'running',
          expanded: false,
        });
      }
    }
  }
  return entries;
}

/**
 * Convert cached toolCalls JSON from DB into ToolEntry[] for the panel.
 */
export function toolCallsToEntries(toolCalls: unknown): ToolEntry[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((tc, i) => ({
    id: `cached-${i}`,
    messageId: 'cached',
    name: (tc as { tool?: string }).tool ?? 'unknown',
    params: (tc as { params?: Record<string, unknown> }).params,
    result: (tc as { result?: ToolEntry['result'] }).result,
    status: 'done' as const,
    expanded: false,
  }));
}

/** Resolve tool name from a UIMessage part (v5 or v6 format). */
function resolveToolName(part: UIMessage['parts'][number]): string | null {
  if ('toolName' in part) return (part as { toolName: string }).toolName;
  const type = (part as { type?: string }).type;
  if (typeof type === 'string' && type.startsWith('tool-')) return type.slice(5);
  return null;
}
