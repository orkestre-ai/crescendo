import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPrisma, resetTestTables } from '@/lib/ai-tools/__tests__/test-db';
import { getPreviousToolResult } from '../previous-tool-result';

const prisma = getTestPrisma();

before(async () => { await resetTestTables(prisma); });
after(async () => { await resetTestTables(prisma); });
beforeEach(async () => { await resetTestTables(prisma); });

async function seedExploration() {
  return prisma.exploration.create({
    data: {
      name: 'Test', description: 'x', prompt: 'x', enabledTools: ['page_content_audit'],
    },
  });
}

async function seedPage() {
  return prisma.fundraisingPage.create({
    data: { enPageId: `T-${Math.random().toString(36).slice(2, 8)}`, name: 'x', url: 'https://x', status: 'ACTIVE' },
  });
}

test('returns null when no prior PageInsight exists', async () => {
  const page = await seedPage();
  const expl = await seedExploration();
  const result = await getPreviousToolResult(page.id, expl.id, 'page_content_audit');
  assert.equal(result, null);
});

test('returns result when one insight exists with matching tool', async () => {
  const page = await seedPage();
  const expl = await seedExploration();
  await prisma.pageInsight.create({
    data: {
      pageId: page.id, explorationId: expl.id, mode: 'explore',
      prompt: 'p', response: 'r',
      toolCalls: [{ tool: 'page_content_audit', params: { pageId: page.id }, result: { checks: [], summary: { passed: 0, warnings: 0, failed: 0, skipped: 0 } } }] as never,
      usage: { inputTokens: 1, outputTokens: 1 } as never,
    },
  });
  const result = await getPreviousToolResult(page.id, expl.id, 'page_content_audit') as { checks: unknown[] } | null;
  assert.ok(result);
  assert.ok('checks' in result);
});

test('returns most recent insight when multiple exist', async () => {
  const page = await seedPage();
  const expl = await seedExploration();
  await prisma.pageInsight.create({
    data: {
      pageId: page.id, explorationId: expl.id, mode: 'explore', prompt: 'p', response: 'r',
      toolCalls: [{ tool: 'page_content_audit', params: {}, result: { marker: 'old' } }] as never,
      usage: {} as never,
    },
  });
  await new Promise((r) => setTimeout(r, 5));
  await prisma.pageInsight.create({
    data: {
      pageId: page.id, explorationId: expl.id, mode: 'explore', prompt: 'p', response: 'r',
      toolCalls: [{ tool: 'page_content_audit', params: {}, result: { marker: 'new' } }] as never,
      usage: {} as never,
    },
  });
  const result = await getPreviousToolResult(page.id, expl.id, 'page_content_audit') as { marker: string };
  assert.equal(result.marker, 'new');
});

test('returns last matching entry when toolCalls contains multiple tools', async () => {
  const page = await seedPage();
  const expl = await seedExploration();
  await prisma.pageInsight.create({
    data: {
      pageId: page.id, explorationId: expl.id, mode: 'explore', prompt: 'p', response: 'r',
      toolCalls: [
        { tool: 'org_search', params: {}, result: { irrelevant: true } },
        { tool: 'page_content_audit', params: {}, result: { marker: 'target' } },
      ] as never,
      usage: {} as never,
    },
  });
  const result = await getPreviousToolResult(page.id, expl.id, 'page_content_audit') as { marker: string };
  assert.equal(result.marker, 'target');
});

test('returns null when prior insights exist but none invoked the requested tool', async () => {
  const page = await seedPage();
  const expl = await seedExploration();
  await prisma.pageInsight.create({
    data: {
      pageId: page.id, explorationId: expl.id, mode: 'explore', prompt: 'p', response: 'r',
      toolCalls: [{ tool: 'org_search', params: {}, result: { x: 1 } }] as never,
      usage: {} as never,
    },
  });
  const result = await getPreviousToolResult(page.id, expl.id, 'page_content_audit');
  assert.equal(result, null);
});

test('scoped to explorationId (does not leak across explorations)', async () => {
  const page = await seedPage();
  const a = await seedExploration();
  const b = await seedExploration();
  await prisma.pageInsight.create({
    data: {
      pageId: page.id, explorationId: a.id, mode: 'explore', prompt: 'p', response: 'r',
      toolCalls: [{ tool: 'page_content_audit', params: {}, result: { only: 'a' } }] as never,
      usage: {} as never,
    },
  });
  const result = await getPreviousToolResult(page.id, b.id, 'page_content_audit');
  assert.equal(result, null);
});
