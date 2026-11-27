import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ModelMessage } from 'ai';
import { estimateTokens } from '@/lib/ai/context';
import { KEEP_STEPS, pruneMessages } from '../context';

const FIRST = 'Today is 2026-11-26. Start the report now.';

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    date: `202611${String(i + 1).padStart(2, '0')}`,
    sessions: String(1000 + i),
  }));

type Output = Extract<
  Extract<ModelMessage, { role: 'tool' }>['content'][number],
  { type: 'tool-result' }
>['output'];

/** One step: an assistant message that calls a tool, and the tool's result. */
function step(id: string, toolName: string, value: unknown): ModelMessage[] {
  return [
    {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: id, toolName, input: {} }],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: id,
          toolName,
          output: { type: 'json', value } as Output,
        },
      ],
    },
  ];
}

const queryStep = (n: number, rowCount = 40) =>
  step(`call-${n}`, 'ga4_report', {
    query: `q${n}`,
    data: { headers: ['date', 'sessions'], rows: rows(rowCount) },
    summary: `${rowCount} rows`,
  });

/** A conversation of `count` query steps: q1 is the oldest. */
function conversation(count: number): ModelMessage[] {
  return [
    { role: 'user', content: FIRST },
    ...Array.from({ length: count }, (_, i) => queryStep(i + 1)).flat(),
  ];
}

const total = (messages: ModelMessage[]) =>
  messages.reduce((sum, message) => sum + estimateTokens(message), 0);

function outputOf(messages: ModelMessage[], query: string): Output {
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue;
      const text = JSON.stringify(part.output);
      if (text.includes(`"query":"${query}"`) || text.includes(`query ${query},`)) {
        return part.output;
      }
    }
  }
  throw new Error(`No result for ${query}`);
}

const isCleared = (messages: ModelMessage[], query: string) =>
  outputOf(messages, query).type === 'text';

test('pruneMessages: under the target nothing changes', () => {
  const messages = conversation(10);
  const pruned = pruneMessages(messages, total(messages));
  assert.equal(pruned.cleared, 0);
  assert.equal(pruned.messages, messages);
});

test('pruneMessages: clears the oldest results first and lands at or under the target', () => {
  const messages = conversation(12);
  const target = Math.floor(total(messages) * 0.6);
  const pruned = pruneMessages(messages, target);

  assert.ok(total(pruned.messages) <= target, 'at or under the target');
  assert.ok(pruned.cleared > 0);
  // The cleared ones are the oldest, with no gap.
  const cleared = Array.from({ length: 12 }, (_, i) => isCleared(pruned.messages, `q${i + 1}`));
  assert.deepEqual(
    cleared,
    Array.from({ length: 12 }, (_, i) => i < pruned.cleared)
  );
  // It stops as soon as it is under: one fewer would still be over.
  const oneFewer = pruned.cleared - 1;
  const withOneFewer = pruneMessages(messages, target).messages.map((message, i) =>
    i === 2 * oneFewer + 2 ? messages[i] : message
  );
  assert.ok(total(withOneFewer) > target);
});

test('pruneMessages: the stub names the query, its row count and its columns', () => {
  const messages = conversation(8);
  const pruned = pruneMessages(messages, 0);
  assert.deepEqual(outputOf(pruned.messages, 'q1'), {
    type: 'text',
    value:
      'Cleared to save space: query q1, 40 rows, columns: date, sessions. Call read_query to read it again.',
  });
});

test('pruneMessages: never clears the first user message or the last 6 steps', () => {
  const messages = conversation(10);
  // A target of zero cannot be met; it must still stop at the rules.
  const pruned = pruneMessages(messages, 0);

  assert.equal(pruned.cleared, 10 - KEEP_STEPS);
  assert.deepEqual(pruned.messages[0], { role: 'user', content: FIRST });
  for (let n = 1; n <= 10; n++) {
    assert.equal(isCleared(pruned.messages, `q${n}`), n <= 10 - KEEP_STEPS, `q${n}`);
  }
  // The last 6 steps are the very same objects.
  assert.deepEqual(pruned.messages.slice(-12), messages.slice(-12));
});

test('pruneMessages: with 6 steps or fewer there is nothing it may clear', () => {
  const messages = conversation(KEEP_STEPS);
  const pruned = pruneMessages(messages, 0);
  assert.equal(pruned.cleared, 0);
  assert.deepEqual(pruned.messages, messages);
});

test('pruneMessages: a result no figure or dataset has used is kept while others can go', () => {
  const messages = conversation(12);
  // q1 and q2 are unused; q3 to q6 are used.
  const usedQueries = new Set(['q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12']);
  const perResult = estimateTokens(messages[2]);
  // Room to clear two results only.
  const target = total(messages) - perResult - 10;
  const pruned = pruneMessages(messages, target, { usedQueries });

  assert.equal(pruned.cleared, 2);
  assert.equal(isCleared(pruned.messages, 'q1'), false);
  assert.equal(isCleared(pruned.messages, 'q2'), false);
  assert.equal(isCleared(pruned.messages, 'q3'), true);
  assert.equal(isCleared(pruned.messages, 'q4'), true);
});

test('pruneMessages: unused results go only when nothing else is left', () => {
  const messages = conversation(12);
  const usedQueries = new Set(['q3', 'q4', 'q5', 'q6']);
  const pruned = pruneMessages(messages, 0, { usedQueries });

  // Everything outside the last 6 steps is cleared in the end, used or not.
  assert.equal(pruned.cleared, 6);
  for (let n = 1; n <= 6; n++) assert.equal(isCleared(pruned.messages, `q${n}`), true, `q${n}`);
  for (let n = 7; n <= 12; n++) assert.equal(isCleared(pruned.messages, `q${n}`), false, `q${n}`);
});

test('pruneMessages: read_query results are cleared too; ledger tool results are not', () => {
  const messages: ModelMessage[] = [
    { role: 'user', content: FIRST },
    ...step('read-1', 'read_query', {
      query: 'q1',
      headers: ['date', 'sessions'],
      rows: rows(30),
      rowCount: 30,
    }),
    ...step('figure-1', 'record_figure', { key: 'sessions_7d', value: 7000, display: '7,000' }),
    ...step('error-1', 'ga4_report', { error: 'Dates must be absolute.' }),
    ...Array.from({ length: KEEP_STEPS }, (_, i) => queryStep(i + 2)).flat(),
  ];
  const pruned = pruneMessages(messages, 0);

  assert.equal(pruned.cleared, 1);
  assert.equal(
    (outputOf(pruned.messages, 'q1') as { value: string }).value,
    'Cleared to save space: query q1, 30 rows, columns: date, sessions. Call read_query to read it again.'
  );
  assert.deepEqual(pruned.messages[4], messages[4]);
  assert.deepEqual(pruned.messages[6], messages[6]);
});

test('pruneMessages: a result already cleared is not cleared or counted again', () => {
  const messages = conversation(10);
  const first = pruneMessages(messages, 0);
  const second = pruneMessages(first.messages, 0);
  assert.equal(first.cleared, 4);
  assert.equal(second.cleared, 0);
  assert.deepEqual(second.messages, first.messages);
});

test('pruneMessages: the messages passed in are not changed', () => {
  const messages = conversation(10);
  const before = structuredClone(messages);
  pruneMessages(messages, 0);
  assert.deepEqual(messages, before);
});

test('pruneMessages: tool calls keep their results, so the conversation stays valid', () => {
  const messages = conversation(10);
  const pruned = pruneMessages(messages, 0).messages;
  assert.equal(pruned.length, messages.length);
  pruned.forEach((message, i) => {
    assert.equal(message.role, messages[i].role);
    if (message.role !== 'tool') return;
    const before = messages[i] as typeof message;
    assert.equal(message.content.length, before.content.length);
    message.content.forEach((part, j) => {
      const original = before.content[j];
      assert.equal(part.type, 'tool-result');
      if (part.type === 'tool-result' && original.type === 'tool-result') {
        assert.equal(part.toolCallId, original.toolCallId);
        assert.equal(part.toolName, original.toolName);
      }
    });
  });
});
