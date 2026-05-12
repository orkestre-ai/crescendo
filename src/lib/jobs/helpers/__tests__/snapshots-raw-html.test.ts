// IMPORTANT: test-db must be imported first — it mutates POSTGRES_PRISMA_URL
// before @/lib/db is loaded. Dynamic import of the helper is used to ensure
// that ordering is respected even when bundlers/transpilers reorder static imports.
import { getTestPrisma, resetTestTables } from '@/lib/ai-tools/__tests__/test-db';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PageContent } from '@/types';

const prisma = getTestPrisma();

before(async () => {
  await resetTestTables(prisma);
});

after(async () => {
  await resetTestTables(prisma);
});

beforeEach(async () => {
  await resetTestTables(prisma);
});

test('ContentSnapshot row persists rawHtml field', async () => {
  const page = await prisma.fundraisingPage.create({
    data: {
      enPageId: 'TEST-RAW-HTML',
      name: 'Test',
      url: 'https://example.org/donate',
      status: 'ACTIVE',
    },
  });

  const html = '<html><body><h1>Hi</h1></body></html>';
  await prisma.contentSnapshot.create({
    data: {
      pageId: page.id,
      contentHash: 'test-hash',
      metaTitle: null,
      appealText: null,
      narrativeText: 'Hi',
      rawHtml: html,
    },
  });

  const row = await prisma.contentSnapshot.findFirst({
    where: { pageId: page.id },
  });
  assert.equal(row?.rawHtml, html);
});

test('createSnapshotWithLifetime persists content.rawHtml', async () => {
  // Dynamic import ensures @/lib/db is loaded after test-db has already
  // mutated POSTGRES_PRISMA_URL to point at the test database.
  const { createSnapshotWithLifetime } = await import('@/lib/jobs/helpers/snapshots');

  const page = await prisma.fundraisingPage.create({
    data: {
      enPageId: 'TEST-RAW-HTML-2',
      name: 'Test 2',
      url: 'https://example.org/donate/2',
      status: 'ACTIVE',
    },
  });

  const content: PageContent = {
    url: page.url,
    h1: null,
    metaDescription: null,
    cta: [],
    donationAmounts: [],
    scrapedAt: new Date(),
    narrativeText: 'Stripped text',
    rawHtml: '<html><body><h1>Raw</h1></body></html>',
  };

  const logger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
    trace() {},
    fatal() {},
  } as any;

  const settings = {
    depth: {
      screenshots: false,
      consoleErrors: false,
      pageContent: true,
      donationAmounts: true,
    },
  } as any;

  await createSnapshotWithLifetime(page, 'hash-2', content, settings, { logger });

  const row = await prisma.contentSnapshot.findFirst({ where: { pageId: page.id } });
  assert.equal(row?.rawHtml, '<html><body><h1>Raw</h1></body></html>');
});
