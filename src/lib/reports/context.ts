import type { ModelMessage } from 'ai';
import { estimateTokens } from '@/lib/ai/context';
import { queryTable } from './ledger';

/** The most recent steps, whose tool results are never cleared. */
export const KEEP_STEPS = 6;

type ToolResultPart = Extract<
  Extract<ModelMessage, { role: 'tool' }>['content'][number],
  { type: 'tool-result' }
>;

type QueryResult = { query: string; data?: unknown };

// A result that carries a query key: a data tool's answer, or read_query's.
function queryResult(part: ToolResultPart): QueryResult | null {
  if (part.output.type !== 'json') return null;
  const value = part.output.value as { query?: unknown } | null;
  return typeof value?.query === 'string' ? (value as QueryResult) : null;
}

function stub(part: ToolResultPart, result: QueryResult): ToolResultPart {
  const { headers, rows } = queryTable(result.data ?? result);
  return {
    ...part,
    output: {
      type: 'text',
      value: `Cleared to save space: query ${result.query}, ${rows.length} rows, columns: ${headers.join(', ')}. Call read_query to read it again.`,
    },
  };
}

/**
 * Replace the oldest query results in the model's working messages with a
 * one-line stub, until the estimate is at or under `targetTokens`. The first
 * user message and the last 6 steps are never touched. Results that a figure
 * or dataset has used (`usedQueries`) go first; unused ones only when nothing
 * else is left. The rows stay in the database, and read_query reads them back.
 *
 * Call it only when the input has passed the cap, with a target well under
 * it: one large clear keeps the prompt cache valid until the next one.
 */
export function pruneMessages(
  messages: ModelMessage[],
  targetTokens: number,
  opts: { usedQueries?: ReadonlySet<string> } = {}
): { messages: ModelMessage[]; cleared: number } {
  const sizes = messages.map(estimateTokens);
  let total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= targetTokens) return { messages, cleared: 0 };

  // A step is one assistant message and the tool results that follow it.
  const steps = messages.flatMap((message, i) => (message.role === 'assistant' ? [i] : []));
  const keepFrom = steps.length > KEEP_STEPS ? steps[steps.length - KEEP_STEPS] : 0;

  const candidates: { message: number; part: number; result: QueryResult; used: boolean }[] = [];
  messages.slice(0, keepFrom).forEach((message, i) => {
    if (message.role !== 'tool') return;
    message.content.forEach((part, j) => {
      if (part.type !== 'tool-result') return;
      const result = queryResult(part);
      if (result) {
        const used = opts.usedQueries?.has(result.query) ?? true;
        candidates.push({ message: i, part: j, result, used });
      }
    });
  });

  const pruned = [...messages];
  let cleared = 0;
  for (const used of [true, false]) {
    for (const candidate of candidates) {
      if (total <= targetTokens) return { messages: pruned, cleared };
      if (candidate.used !== used) continue;

      const message = pruned[candidate.message] as Extract<ModelMessage, { role: 'tool' }>;
      const content = [...message.content];
      content[candidate.part] = stub(content[candidate.part] as ToolResultPart, candidate.result);
      pruned[candidate.message] = { ...message, content };

      const size = estimateTokens(pruned[candidate.message]);
      total += size - sizes[candidate.message];
      sizes[candidate.message] = size;
      cleared++;
    }
  }
  return { messages: pruned, cleared };
}
