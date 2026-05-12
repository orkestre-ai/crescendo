import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDynamicVariables } from '../dynamic-template-variables';

test('no tokens: returns template unchanged', async () => {
  const result = await resolveDynamicVariables('Hello {{pageName}}', { pageId: 'p', explorationId: 'e' });
  assert.equal(result, 'Hello {{pageName}}');
});

test('substitutes single token with JSON', async () => {
  const resolver = async () => ({ foo: 'bar' });
  const result = await resolveDynamicVariables(
    'Prev: {{previousToolResult:page_content_audit}} end',
    { pageId: 'p', explorationId: 'e' },
    resolver
  );
  assert.equal(result, 'Prev: {"foo":"bar"} end');
});

test('inserts fallback text when resolver returns null', async () => {
  const resolver = async () => null;
  const result = await resolveDynamicVariables(
    'Before {{previousToolResult:page_content_audit}} after',
    { pageId: 'p', explorationId: 'e' },
    resolver
  );
  assert.match(result, /no previous run/);
});

test('batches resolution for duplicate tokens (resolver called once per unique tool)', async () => {
  let calls = 0;
  const resolver = async (_pid: string, _eid: string, tool: string) => {
    calls += 1;
    return { tool };
  };
  const template = '{{previousToolResult:foo}} and {{previousToolResult:foo}}';
  await resolveDynamicVariables(template, { pageId: 'p', explorationId: 'e' }, resolver);
  assert.equal(calls, 1);
});

test('handles multiple distinct tool names', async () => {
  const resolver = async (_pid: string, _eid: string, tool: string) => ({ t: tool });
  const template = '{{previousToolResult:foo}} + {{previousToolResult:bar}}';
  const result = await resolveDynamicVariables(template, { pageId: 'p', explorationId: 'e' }, resolver);
  assert.match(result, /"t":"foo"/);
  assert.match(result, /"t":"bar"/);
});

test('does not throw on unknown / typo tool name (inserts fallback)', async () => {
  const resolver = async () => null;
  const result = await resolveDynamicVariables(
    '{{previousToolResult:notARealTool}}',
    { pageId: 'p', explorationId: 'e' },
    resolver
  );
  assert.match(result, /no previous run/);
});

test('passes pageId and explorationId to resolver', async () => {
  let seenPid = '';
  let seenEid = '';
  const resolver = async (pid: string, eid: string) => {
    seenPid = pid;
    seenEid = eid;
    return null;
  };
  await resolveDynamicVariables(
    '{{previousToolResult:foo}}',
    { pageId: 'THE_PAGE', explorationId: 'THE_EXPL' },
    resolver
  );
  assert.equal(seenPid, 'THE_PAGE');
  assert.equal(seenEid, 'THE_EXPL');
});
