import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getTestPrisma, resetTestTables, closeTestPrisma } from './test-db';
import { pageContentAuditTool, PageContentAuditOutputSchema } from '../page-content-audit';

const prisma = getTestPrisma();

before(async () => {
  await resetTestTables(prisma);
});
after(async () => {
  await resetTestTables(prisma);
  await closeTestPrisma();
});
beforeEach(async () => {
  await resetTestTables(prisma);
});

async function seedPageWithSnapshot(html: string, diagnostics: unknown = null) {
  const page = await prisma.fundraisingPage.create({
    data: {
      enPageId: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test Page',
      url: 'https://example.org/donate/test',
      status: 'ACTIVE',
    },
  });
  await prisma.contentSnapshot.create({
    data: {
      pageId: page.id,
      metaTitle: 'Test Page Title That Is Thirty Five Ch',
      appealText: 'Please donate today to help our shelter care for rescued animals.',
      narrativeText: html,
      rawHtml: html,
      diagnostics: diagnostics as never,
    },
  });
  return page;
}

test('integration: output validates against schema', async () => {
  const page = await seedPageWithSnapshot(
    '<html><head><meta name="description" content="Support our shelter and help the animals in need today for a better world and future."><link rel="canonical" href="https://example.org/donate/test"><meta property="og:title" content="x"><meta property="og:description" content="x"><meta property="og:image" content="https://example.org/og.jpg"><meta property="og:url" content="https://example.org/donate/test"><link rel="icon" href="https://example.org/favicon.ico"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><a href="/privacy">Privacy</a><button type="submit">Donate</button><p>Your donation is tax-deductible.</p></body></html>',
    { consoleErrors: [], consoleWarnings: [] }
  );
  const result = await pageContentAuditTool.execute({ pageId: page.id });
  assert.ok(result.data, 'should have data field');
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  assert.equal(parsed.contentSnapshotId !== null, true);
});

test('integration: every expected checkId appears exactly once', async () => {
  const page = await seedPageWithSnapshot('<html></html>');
  const result = await pageContentAuditTool.execute({ pageId: page.id });
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  const expectedIds = [
    'title_present', 'title_length', 'meta_description', 'og_tags_complete',
    'og_image_dimensions', 'canonical_url', 'https_and_mixed_content',
    'favicon_present', 'privacy_terms_links', 'donation_form_renders',
    'structured_data_present', 'console_errors_clean', 'reading_level',
    'tax_receipt_language_present', 'spelling_clean',
  ];
  assert.equal(parsed.checks.length, expectedIds.length);
  for (const id of expectedIds) {
    const found = parsed.checks.filter((c) => c.checkId === id);
    assert.equal(found.length, 1, `checkId ${id} should appear exactly once`);
  }
});

test('integration: summary counts match check statuses', async () => {
  const page = await seedPageWithSnapshot('<html></html>');
  const result = await pageContentAuditTool.execute({ pageId: page.id });
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  const { passed, warnings, failed, skipped } = parsed.summary;
  assert.equal(passed + warnings + failed + skipped, parsed.checks.length);
});

test('integration: suggestion is non-null iff status is warn or fail', async () => {
  const page = await seedPageWithSnapshot('<html></html>');
  const result = await pageContentAuditTool.execute({ pageId: page.id });
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  for (const check of parsed.checks) {
    const needsSuggestion = check.status === 'warn' || check.status === 'fail';
    if (needsSuggestion) {
      assert.ok(check.suggestion, `${check.checkId} status=${check.status} should have suggestion`);
    } else {
      assert.equal(check.suggestion, null, `${check.checkId} status=${check.status} should have null suggestion`);
    }
  }
});

test('integration: throws when pageId does not exist', async () => {
  await assert.rejects(
    () => pageContentAuditTool.execute({ pageId: 'nonexistent' }),
    /not found/i
  );
});

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures/oxfam-sample.html'),
  'utf-8'
);

test('uses rawHtml to detect the submit button (not narrativeText)', async () => {
  const page = await prisma.fundraisingPage.create({
    data: {
      enPageId: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Oxfam Test',
      url: 'https://secured.oxfam.ca/page/187140/donate/1',
      status: 'ACTIVE',
    },
  });
  await prisma.contentSnapshot.create({
    data: {
      pageId: page.id,
      rawHtml: FIXTURE,
      narrativeText: 'stripped body text only — no <button>',
      appealText: "Together with changemakers across Canada, we're building a world where everyone thrives.",
      metaTitle: 'Donate - Join our Movement for Justice | Oxfam Canada',
    },
  });

  const result = await pageContentAuditTool.execute({ pageId: page.id });
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  const donationCheck = parsed.checks.find((c) => c.checkId === 'donation_form_renders');
  assert.equal(donationCheck?.status, 'pass');
});

test('pre-migration snapshot (no rawHtml) gets specific skip evidence for HTML checks', async () => {
  const page = await prisma.fundraisingPage.create({
    data: {
      enPageId: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Pre-migration Test',
      url: 'https://example.org/donate/pre-migration',
      status: 'ACTIVE',
    },
  });
  await prisma.contentSnapshot.create({
    data: {
      pageId: page.id,
      narrativeText: '<html>old data</html>',
      // rawHtml intentionally omitted — simulates pre-migration row.
    },
  });

  const result = await pageContentAuditTool.execute({ pageId: page.id });
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  const donationCheck = parsed.checks.find((c) => c.checkId === 'donation_form_renders');
  assert.equal(donationCheck?.status, 'skip');
  assert.ok(donationCheck?.evidence?.includes('rawHtml missing'), `expected rawHtml-specific skip evidence, got: ${donationCheck?.evidence}`);

  // Sanity check: non-HTML checks should NOT get the specific message.
  const titleCheck = parsed.checks.find((c) => c.checkId === 'title_length');
  assert.ok(!titleCheck?.evidence?.includes('rawHtml missing'), 'non-HTML checks should not get the rawHtml-specific message');
});

test('uses rawHtml to detect structured data', async () => {
  const page = await prisma.fundraisingPage.create({
    data: {
      enPageId: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Oxfam Test 2',
      url: 'https://secured.oxfam.ca/page/187140/donate/2',
      status: 'ACTIVE',
    },
  });
  await prisma.contentSnapshot.create({
    data: {
      pageId: page.id,
      rawHtml: FIXTURE,
      narrativeText: 'stripped body text only',
    },
  });

  const result = await pageContentAuditTool.execute({ pageId: page.id });
  const parsed = PageContentAuditOutputSchema.parse(result.data);
  const structured = parsed.checks.find((c) => c.checkId === 'structured_data_present');
  assert.equal(structured?.status, 'pass');
});
