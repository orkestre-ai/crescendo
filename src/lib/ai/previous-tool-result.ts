import { prisma } from '@/lib/db';

type ToolCallEntry = { tool: string; params: unknown; result: unknown };

/**
 * Returns the most recent tool result for a (page, exploration, tool) tuple, or null.
 *
 * Walks the most recent PageInsight row's `toolCalls` array and returns the LAST entry
 * whose `tool === toolName` (i.e., if the model called the tool multiple times in that run,
 * we return the final invocation).
 */
export async function getPreviousToolResult(
  pageId: string,
  explorationId: string,
  toolName: string
): Promise<unknown | null> {
  const insight = await prisma.pageInsight.findFirst({
    where: { pageId, explorationId },
    orderBy: { createdAt: 'desc' },
    select: { toolCalls: true },
  });
  if (!insight || !insight.toolCalls) return null;
  const calls = insight.toolCalls as unknown;
  if (!Array.isArray(calls)) return null;

  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const entry = calls[i] as ToolCallEntry | undefined;
    if (entry && entry.tool === toolName) {
      return entry.result ?? null;
    }
  }
  return null;
}
