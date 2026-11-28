import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import { withKeepAlive } from '../keep-alive';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const encoder = new TextEncoder();

test('sends pings while the source is quiet, and clients ignore them', async () => {
  const source = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"n":1}\n\n'));
      await sleep(120);
      controller.enqueue(encoder.encode('data: {"n":2}\n\n'));
      controller.close();
    },
  });
  const response = withKeepAlive(
    new Response(source, { headers: { 'content-type': 'text/event-stream' } }),
    25
  );
  assert.equal(response.headers.get('content-type'), 'text/event-stream');

  const [raw, parsed] = response.body!.tee();
  const rawText = await new Response(raw).text();
  assert.ok((rawText.match(/: ping\n\n/g) ?? []).length >= 2, 'expected pings during the quiet gap');

  const events: string[] = [];
  const reader = parsed
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value.data);
  }
  assert.deepEqual(events, ['{"n":1}', '{"n":2}']);
});

test('stops pinging and cancels the source when the client goes away', async () => {
  let cancelled = false;
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const response = withKeepAlive(new Response(source), 10);
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await sleep(40);
  assert.equal(cancelled, true);
});
