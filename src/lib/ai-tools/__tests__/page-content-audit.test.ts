import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PageContentAuditOutputSchema,
  CheckResultSchema,
  runTitlePresentCheck,
  runTitleLengthCheck,
  runMetaDescriptionCheck,
  runOgTagsCompleteCheck,
  runOgImageDimensionsCheck,
  runCanonicalUrlCheck,
  runHttpsAndMixedContentCheck,
  runFaviconPresentCheck,
  runPrivacyTermsLinksCheck,
  runDonationFormRendersCheck,
  runStructuredDataPresentCheck,
  runConsoleErrorsCleanCheck,
  runReadingLevelCheck,
  runTaxReceiptLanguageCheck,
  runSpellingCleanCheck,
  extractLinkInventoryForTest,
} from '../page-content-audit';

test('CheckResultSchema: suggestion is nullable when status is pass', () => {
  const parsed = CheckResultSchema.parse({
    checkId: 'title_present',
    label: 'Title present',
    category: 'metadata',
    status: 'pass',
    severity: 'major',
    confidence: 'deterministic',
    evidence: 'Support Animals',
    suggestion: null,
  });
  assert.equal(parsed.status, 'pass');
  assert.equal(parsed.suggestion, null);
});

test('PageContentAuditOutputSchema: validates complete output', () => {
  const parsed = PageContentAuditOutputSchema.parse({
    checks: [
      {
        checkId: 'title_present',
        label: 'Title present',
        category: 'metadata',
        status: 'pass',
        severity: 'major',
        confidence: 'deterministic',
        evidence: 'A title',
        suggestion: null,
      },
    ],
    summary: { passed: 1, warnings: 0, failed: 0, skipped: 0 },
    auditedAt: '2026-04-24T00:00:00.000Z',
    contentSnapshotId: null,
  });
  assert.equal(parsed.summary.passed, 1);
});

test('PageContentAuditOutputSchema: rejects invalid category', () => {
  assert.throws(() =>
    PageContentAuditOutputSchema.parse({
      checks: [
        {
          checkId: 'x',
          label: 'x',
          category: 'invalid',
          status: 'pass',
          severity: 'minor',
          evidence: null,
          suggestion: null,
        },
      ],
      summary: { passed: 1, warnings: 0, failed: 0, skipped: 0 },
      auditedAt: '2026-04-24T00:00:00.000Z',
      contentSnapshotId: null,
    })
  );
});

test('title_present: pass when both FundraisingPage title and scraped title non-empty', () => {
  const r = runTitlePresentCheck({
    fundraisingPageName: 'Support Orphaned Animals',
    metaTitle: 'Support Orphaned Animals | Org',
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.checkId, 'title_present');
  assert.equal(r.severity, 'major');
  assert.equal(r.suggestion, null);
});

test('title_present: fail when metaTitle empty', () => {
  const r = runTitlePresentCheck({
    fundraisingPageName: 'Support Orphaned Animals',
    metaTitle: null,
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.suggestion && r.suggestion.length > 0);
});

test('title_present: fail when fundraisingPageName empty', () => {
  const r = runTitlePresentCheck({
    fundraisingPageName: '',
    metaTitle: 'Some scraped title',
  });
  assert.equal(r.status, 'fail');
});

test('title_present: skip when input is null (missing FundraisingPage)', () => {
  const r = runTitlePresentCheck(null);
  assert.equal(r.status, 'skip');
  assert.ok(r.evidence && r.evidence.includes('No content snapshot'));
});

test('title_length: pass when <title> is 30–60 chars', () => {
  const r = runTitleLengthCheck({ metaTitle: 'Support Orphaned Animals Today | Our Org' });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'minor');
});

test('title_length: warn when too short', () => {
  const r = runTitleLengthCheck({ metaTitle: 'Donate' });
  assert.equal(r.status, 'warn');
  assert.ok(r.suggestion);
});

test('title_length: warn when too long', () => {
  const r = runTitleLengthCheck({ metaTitle: 'x'.repeat(80) });
  assert.equal(r.status, 'warn');
});

test('title_length: skip when metaTitle null', () => {
  const r = runTitleLengthCheck({ metaTitle: null });
  assert.equal(r.status, 'skip');
});

test('title_length: skip when input null', () => {
  const r = runTitleLengthCheck(null);
  assert.equal(r.status, 'skip');
});

test('meta_description: pass when 70–160 chars', () => {
  const desc = 'Support orphaned animals in our local shelter — your donation funds food, medical care, and permanent adoptive families.';
  const r = runMetaDescriptionCheck({ metaDescription: { present: true, value: desc } });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'major');
});

test('meta_description: fail when tag absent', () => {
  const r = runMetaDescriptionCheck({ metaDescription: { present: false, value: null } });
  assert.equal(r.status, 'fail');
  assert.ok(r.suggestion);
});

test('meta_description: warn when too short', () => {
  const r = runMetaDescriptionCheck({ metaDescription: { present: true, value: 'Donate now.' } });
  assert.equal(r.status, 'warn');
});

test('meta_description: warn when too long', () => {
  const r = runMetaDescriptionCheck({ metaDescription: { present: true, value: 'x'.repeat(200) } });
  assert.equal(r.status, 'warn');
});

test('meta_description: skip when input null', () => {
  const r = runMetaDescriptionCheck(null);
  assert.equal(r.status, 'skip');
});

test('og_tags_complete: pass when all four present and populated', () => {
  const r = runOgTagsCompleteCheck({
    ogTitle: { present: true, value: 'Orphaned Animals' },
    ogDescription: { present: true, value: 'Help today' },
    ogImage: { present: true, value: 'https://example.org/og.jpg' },
    ogUrl: { present: true, value: 'https://example.org/donate/animals' },
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'major');
});

test('og_tags_complete: fail when og:image absent', () => {
  const r = runOgTagsCompleteCheck({
    ogTitle: { present: true, value: 'x' },
    ogDescription: { present: true, value: 'x' },
    ogImage: { present: false, value: null },
    ogUrl: { present: true, value: 'https://x' },
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.suggestion && r.suggestion.includes('og:image'));
});

test('og_tags_complete: skip when input null', () => {
  const r = runOgTagsCompleteCheck(null);
  assert.equal(r.status, 'skip');
});

test('og_image_dimensions: pass when ≥1200×630 and ratio ~1.91', () => {
  const r = runOgImageDimensionsCheck({ width: 1200, height: 630 });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'minor');
});

test('og_image_dimensions: warn when too small', () => {
  const r = runOgImageDimensionsCheck({ width: 800, height: 420 });
  assert.equal(r.status, 'warn');
});

test('og_image_dimensions: warn when ratio off (square)', () => {
  const r = runOgImageDimensionsCheck({ width: 1200, height: 1200 });
  assert.equal(r.status, 'warn');
});

test('og_image_dimensions: skip when input null', () => {
  const r = runOgImageDimensionsCheck(null);
  assert.equal(r.status, 'skip');
});

test('canonical_url: pass when canonical resolves to pageUrl', () => {
  const r = runCanonicalUrlCheck({
    pageUrl: 'https://example.org/donate/animals',
    canonicalHref: 'https://example.org/donate/animals',
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'minor');
});

test('canonical_url: warn when canonical points elsewhere', () => {
  const r = runCanonicalUrlCheck({
    pageUrl: 'https://example.org/donate/animals',
    canonicalHref: 'https://example.org/donate/other',
  });
  assert.equal(r.status, 'warn');
  assert.ok(r.suggestion);
});

test('canonical_url: fail when canonical missing', () => {
  const r = runCanonicalUrlCheck({
    pageUrl: 'https://example.org/donate/animals',
    canonicalHref: null,
  });
  assert.equal(r.status, 'fail');
});

test('canonical_url: skip when input null', () => {
  const r = runCanonicalUrlCheck(null);
  assert.equal(r.status, 'skip');
});

test('https_and_mixed_content: pass when HTTPS and no http refs', () => {
  const r = runHttpsAndMixedContentCheck({
    pageUrl: 'https://example.org/donate',
    html: '<img src="https://example.org/a.png"><link href="https://x.com/y.css">',
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'critical');
});

test('https_and_mixed_content: fail when page URL is http', () => {
  const r = runHttpsAndMixedContentCheck({
    pageUrl: 'http://example.org/donate',
    html: '<body></body>',
  });
  assert.equal(r.status, 'fail');
});

test('https_and_mixed_content: fail when mixed http refs exist', () => {
  const r = runHttpsAndMixedContentCheck({
    pageUrl: 'https://example.org/donate',
    html: '<script src="http://tracker.com/x.js"></script>',
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.evidence && r.evidence.includes('http://'));
});

test('https_and_mixed_content: skip when input null', () => {
  const r = runHttpsAndMixedContentCheck(null);
  assert.equal(r.status, 'skip');
});

test('favicon_present: pass when link present and resolves', () => {
  const r = runFaviconPresentCheck({ faviconHref: 'https://example.org/favicon.ico', resolves: true });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'minor');
});

test('favicon_present: warn when link present but does not resolve', () => {
  const r = runFaviconPresentCheck({ faviconHref: 'https://example.org/missing.ico', resolves: false });
  assert.equal(r.status, 'warn');
});

test('favicon_present: fail when no link tag', () => {
  const r = runFaviconPresentCheck({ faviconHref: null, resolves: false });
  assert.equal(r.status, 'fail');
});

test('favicon_present: skip when input null', () => {
  const r = runFaviconPresentCheck(null);
  assert.equal(r.status, 'skip');
});

test('privacy_terms_links: pass when privacy link exists', () => {
  const r = runPrivacyTermsLinksCheck({
    links: [
      { href: '/about', text: 'About' },
      { href: '/privacy', text: 'Privacy Policy' },
    ],
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'major');
});

test('privacy_terms_links: pass when terms link exists', () => {
  const r = runPrivacyTermsLinksCheck({
    links: [
      { href: '/terms-of-service', text: 'Legal' },
    ],
  });
  assert.equal(r.status, 'pass');
});

test('privacy_terms_links: fail when neither present', () => {
  const r = runPrivacyTermsLinksCheck({
    links: [{ href: '/donate', text: 'Give' }],
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.suggestion);
});

test('privacy_terms_links: skip when input null', () => {
  const r = runPrivacyTermsLinksCheck(null);
  assert.equal(r.status, 'skip');
});

test('donation_form_renders: pass when submit button present', () => {
  const r = runDonationFormRendersCheck({
    html: '<form><button type="submit">Give</button></form>',
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'critical');
});

test('donation_form_renders: pass when donate-like button text', () => {
  const r = runDonationFormRendersCheck({
    html: '<button>Donate $50</button>',
  });
  assert.equal(r.status, 'pass');
});

test('donation_form_renders: fail when no button at all', () => {
  const r = runDonationFormRendersCheck({
    html: '<div>Coming soon</div>',
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.suggestion);
});

test('donation_form_renders: skip when input null', () => {
  const r = runDonationFormRendersCheck(null);
  assert.equal(r.status, 'skip');
});

test('structured_data_present: pass when valid JSON-LD script found', () => {
  const r = runStructuredDataPresentCheck({
    html: '<script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>',
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'minor');
});

test('structured_data_present: warn when script present but invalid JSON', () => {
  const r = runStructuredDataPresentCheck({
    html: '<script type="application/ld+json">{not-json}</script>',
  });
  assert.equal(r.status, 'warn');
});

test('structured_data_present: fail when no script tag', () => {
  const r = runStructuredDataPresentCheck({ html: '<body></body>' });
  assert.equal(r.status, 'fail');
});

test('structured_data_present: skip when input null', () => {
  const r = runStructuredDataPresentCheck(null);
  assert.equal(r.status, 'skip');
});

test('console_errors_clean: pass when zero errors and ≤2 warnings', () => {
  const r = runConsoleErrorsCleanCheck({
    diagnostics: { consoleErrors: [], consoleWarnings: ['minor'] },
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'critical');
});

test('console_errors_clean: fail when errors > 0', () => {
  const r = runConsoleErrorsCleanCheck({
    diagnostics: { consoleErrors: ['TypeError'], consoleWarnings: [] },
  });
  assert.equal(r.status, 'fail');
});

test('console_errors_clean: warn when errors=0 but warnings>2', () => {
  const r = runConsoleErrorsCleanCheck({
    diagnostics: { consoleErrors: [], consoleWarnings: ['a', 'b', 'c'] },
  });
  assert.equal(r.status, 'warn');
});

test('console_errors_clean: skip when diagnostics null', () => {
  const r = runConsoleErrorsCleanCheck({ diagnostics: null });
  assert.equal(r.status, 'skip');
});

test('console_errors_clean: skip when input null', () => {
  const r = runConsoleErrorsCleanCheck(null);
  assert.equal(r.status, 'skip');
});

test('reading_level: pass for simple copy (grade ≤ 12)', () => {
  const easy = 'Kids are hungry. They need food. Please give today. Your gift helps them eat.';
  const r = runReadingLevelCheck({ appealText: easy });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'minor');
});

test('reading_level: warn for dense/academic copy (grade > 12)', () => {
  const hard =
    'Notwithstanding the philanthropic provenance enumerated heretofore, the organization categorically repudiates any mischaracterization concerning the implementation of its fundraising initiatives.';
  const r = runReadingLevelCheck({ appealText: hard });
  assert.equal(r.status, 'warn');
});

test('reading_level: skip when appealText empty', () => {
  const r = runReadingLevelCheck({ appealText: '' });
  assert.equal(r.status, 'skip');
});

test('reading_level: skip when input null', () => {
  const r = runReadingLevelCheck(null);
  assert.equal(r.status, 'skip');
});

test('tax_receipt_language_present: pass when phrase found', () => {
  const r = runTaxReceiptLanguageCheck({
    copyBlocks: ['Your donation is tax-deductible to the fullest extent of the law.'],
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'major');
});

test('tax_receipt_language_present: pass for alternate phrase', () => {
  const r = runTaxReceiptLanguageCheck({
    copyBlocks: ['We will email you a charitable receipt within 48 hours.'],
  });
  assert.equal(r.status, 'pass');
});

test('tax_receipt_language_present: fail when no phrase match', () => {
  const r = runTaxReceiptLanguageCheck({
    copyBlocks: ['Please donate today to help us help others.'],
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.suggestion);
});

test('tax_receipt_language_present: skip when input null', () => {
  const r = runTaxReceiptLanguageCheck(null);
  assert.equal(r.status, 'skip');
});

test('spelling_clean: pass on well-spelled text', async () => {
  const r = await runSpellingCleanCheck({
    appealText: 'Please donate today to help our shelter care for rescued animals.',
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.severity, 'major');
});

test('spelling_clean: fail when misspellings present', async () => {
  const r = await runSpellingCleanCheck({
    appealText: 'Plz donate to halp our sheltre ower rescud animls.',
  });
  assert.equal(r.status, 'fail');
  assert.ok(r.evidence && r.evidence.length > 0);
});

test('spelling_clean: pass for hardcoded ignore-word', async () => {
  const r = await runSpellingCleanCheck({
    appealText: 'Our NetDonor integration uses Engaging Networks for pagejson export.',
  });
  assert.equal(r.status, 'pass');
});

test('spelling_clean: skip when appeal text empty', async () => {
  const r = await runSpellingCleanCheck({ appealText: '' });
  assert.equal(r.status, 'skip');
});

test('spelling_clean: skip when input null', async () => {
  const r = await runSpellingCleanCheck(null);
  assert.equal(r.status, 'skip');
});

test('og_tags empty content reports as "empty" not "missing"', () => {
  const result = runOgTagsCompleteCheck({
    ogTitle: { present: true, value: '' },
    ogDescription: { present: true, value: '' },
    ogImage: { present: true, value: '' },
    ogUrl: { present: true, value: '' },
  });
  assert.equal(result.status, 'fail');
  assert.ok(result.evidence?.includes('empty'), `evidence should mention "empty", got: ${result.evidence}`);
  assert.ok(!result.evidence?.includes('missing'), `evidence should not use "missing" here, got: ${result.evidence}`);
  assert.ok(result.suggestion && /fill|populate/i.test(result.suggestion), 'suggestion should say fill/populate');
});

test('og_tags absent tags report as "missing"', () => {
  const result = runOgTagsCompleteCheck({
    ogTitle: { present: false, value: null },
    ogDescription: { present: false, value: null },
    ogImage: { present: false, value: null },
    ogUrl: { present: false, value: null },
  });
  assert.ok(result.evidence?.includes('missing'), `evidence should mention "missing", got: ${result.evidence}`);
});

test('meta_description empty content reports as "empty"', () => {
  const result = runMetaDescriptionCheck({
    metaDescription: { present: true, value: '' },
  });
  assert.ok(result.evidence?.toLowerCase().includes('empty'), `evidence should mention "empty", got: ${result.evidence}`);
});

test('runConsoleErrorsCleanCheck formats ConsoleEntry objects (no [object Object])', () => {
  const result = runConsoleErrorsCleanCheck({
    diagnostics: {
      consoleErrors: [
        { text: 'Uncaught TypeError: foo is not a function', url: 'https://example.org/app.js', lineNumber: 42 },
        { text: 'Failed to load resource: net::ERR_FAILED', url: 'https://example.org/style.css' },
        { text: 'ReferenceError: bar is not defined' },
      ],
      consoleWarnings: [],
    },
  });

  assert.equal(result.status, 'fail');
  assert.ok(!result.evidence?.includes('[object Object]'), 'evidence should not contain [object Object]');
  assert.ok(result.evidence?.includes('Uncaught TypeError'), 'evidence should include error text');
  assert.ok(result.evidence?.includes('app.js:42'), 'evidence should include shortened URL + line');
});

test('link inventory extracts text from links with nested elements', () => {
  const html = '<a href="/privacy"><span>Privacy <strong>Policy</strong></span></a>';
  const links = extractLinkInventoryForTest(html);
  assert.deepEqual(links, [{ href: '/privacy', text: 'Privacy Policy' }]);
});

test('privacy_terms_links: detects link with span-wrapped text', () => {
  const result = runPrivacyTermsLinksCheck({
    links: [{ href: '/privacy-policy', text: 'Privacy Policy' }],
  });
  assert.equal(result.status, 'pass');
});

test('spelling_clean surfaces full flagged list via details', async () => {
  const text = 'plz halp sheltre ower rescud tehse aminals nao — thx';
  const result = await runSpellingCleanCheck({ appealText: text });
  assert.equal(result.status, 'fail');
  assert.ok(Array.isArray(result.details?.flaggedWords), 'details.flaggedWords should be an array');
  assert.ok((result.details?.flaggedWords as string[]).length >= 5, `expected ≥5 flagged words, got ${(result.details?.flaggedWords as string[]).length}`);
});

test('https_and_mixed_content reports confidence=deterministic', () => {
  const result = runHttpsAndMixedContentCheck({
    pageUrl: 'https://example.org',
    html: '<html><body><h1>ok</h1></body></html>',
  });
  assert.equal(result.confidence, 'deterministic');
});

test('reading_level reports confidence=heuristic', () => {
  const result = runReadingLevelCheck({ appealText: 'Short text.' });
  assert.equal(result.confidence, 'heuristic');
});

test('spelling_clean reports confidence=heuristic', async () => {
  const result = await runSpellingCleanCheck({ appealText: 'hello world' });
  assert.equal(result.confidence, 'heuristic');
});
