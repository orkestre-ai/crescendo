import { z } from 'zod';
import type { ToolSkill } from './types';
import { prisma } from '@/lib/db';
import { createAiToolLogger } from '@/lib/logging/journeys';
import axios from 'axios';
import * as cheerio from 'cheerio';

// --- Public schemas ---------------------------------------------------------

export const CheckCategorySchema = z.enum([
  'metadata',
  'content',
  'technical',
  'compliance',
]);
export type CheckCategory = z.infer<typeof CheckCategorySchema>;

export const CheckStatusSchema = z.enum(['pass', 'warn', 'fail', 'skip']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckSeveritySchema = z.enum(['critical', 'major', 'minor']);
export type CheckSeverity = z.infer<typeof CheckSeveritySchema>;

export const CheckConfidenceSchema = z.enum(['deterministic', 'heuristic', 'advisory']);
export type CheckConfidence = z.infer<typeof CheckConfidenceSchema>;

export const CheckResultSchema = z.object({
  checkId: z.string(),
  label: z.string(),
  category: CheckCategorySchema,
  status: CheckStatusSchema,
  severity: CheckSeveritySchema,
  confidence: CheckConfidenceSchema,
  evidence: z.string().nullable(),
  suggestion: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const PageContentAuditOutputSchema = z.object({
  checks: z.array(CheckResultSchema),
  summary: z.object({
    passed: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  auditedAt: z.string(),
  contentSnapshotId: z.string().nullable(),
});
export type PageContentAuditOutput = z.infer<typeof PageContentAuditOutputSchema>;

// --- Individual check functions ---

export type MetaValue = { present: boolean; value: string | null };

export function makeMetaValue(raw: string | null | undefined): MetaValue {
  if (raw === null || raw === undefined) return { present: false, value: null };
  return { present: true, value: raw };
}

type TitlePresentInput = { fundraisingPageName: string; metaTitle: string | null } | null;

export function runTitlePresentCheck(input: TitlePresentInput): CheckResult {
  if (input === null) {
    return {
      checkId: 'title_present',
      label: 'Title present',
      category: 'metadata',
      status: 'skip',
      severity: 'major',
      confidence: 'deterministic',
      evidence: 'No content snapshot available — run a DEEP scan first',
      suggestion: null,
    };
  }
  const hasPageName = input.fundraisingPageName.trim().length > 0;
  const hasMeta = (input.metaTitle ?? '').trim().length > 0;
  const pass = hasPageName && hasMeta;
  return {
    checkId: 'title_present',
    label: 'Title present',
    category: 'metadata',
    status: pass ? 'pass' : 'fail',
    severity: 'major',
    confidence: 'deterministic',
    evidence: pass
      ? `Page name: "${input.fundraisingPageName}", <title>: "${input.metaTitle}"`
      : `Page name present: ${hasPageName}; <title> present: ${hasMeta}`,
    suggestion: pass ? null : 'Ensure the page has a non-empty FundraisingPage.name and a <title> tag set in the EN template.',
  };
}

type TitleLengthInput = { metaTitle: string | null } | null;

export function runTitleLengthCheck(input: TitleLengthInput): CheckResult {
  const base = {
    checkId: 'title_length',
    label: 'Title length (30–60 chars)',
    category: 'metadata' as const,
    severity: 'minor' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null || !input.metaTitle) {
    return {
      ...base,
      status: 'skip',
      evidence: 'No <title> available to measure',
      suggestion: null,
    };
  }
  const len = input.metaTitle.trim().length;
  if (len >= 30 && len <= 60) {
    return { ...base, status: 'pass', evidence: `${len} characters`, suggestion: null };
  }
  return {
    ...base,
    status: 'warn',
    evidence: `${len} characters`,
    suggestion:
      len < 30
        ? 'Title is under 30 chars. Add descriptive context (cause, campaign) so search snippets read well.'
        : 'Title exceeds 60 chars and will be truncated in SERPs. Trim to the essential message.',
  };
}

type MetaDescriptionInput = { metaDescription: MetaValue } | null;

export function runMetaDescriptionCheck(input: MetaDescriptionInput): CheckResult {
  const base = {
    checkId: 'meta_description',
    label: 'Meta description (70–160 chars)',
    category: 'metadata' as const,
    severity: 'major' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  const { present, value } = input.metaDescription;
  if (!present) {
    return {
      ...base,
      status: 'fail',
      evidence: 'No <meta name="description"> tag found',
      suggestion: 'Add a meta description to the EN template; aim for 70–160 characters summarizing the appeal.',
    };
  }
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    return {
      ...base,
      status: 'fail',
      evidence: '<meta name="description"> exists but content is empty',
      suggestion: 'Fill the meta description with a 70–160 character summary of the appeal.',
    };
  }
  if (trimmed.length >= 70 && trimmed.length <= 160) {
    return { ...base, status: 'pass', evidence: `${trimmed.length} characters`, suggestion: null };
  }
  return {
    ...base,
    status: 'warn',
    evidence: `${trimmed.length} characters`,
    suggestion:
      trimmed.length < 70
        ? 'Meta description is brief — expand to include cause, impact, and a clear value proposition (aim for 70–160 chars).'
        : 'Meta description may be truncated by search engines; trim to under 160 chars.',
  };
}

type OgTagsInput = {
  ogTitle: MetaValue;
  ogDescription: MetaValue;
  ogImage: MetaValue;
  ogUrl: MetaValue;
} | null;

export function runOgTagsCompleteCheck(input: OgTagsInput): CheckResult {
  const base = {
    checkId: 'og_tags_complete',
    label: 'Open Graph tags complete',
    category: 'metadata' as const,
    severity: 'major' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  const tags: Array<[string, MetaValue]> = [
    ['og:title', input.ogTitle],
    ['og:description', input.ogDescription],
    ['og:image', input.ogImage],
    ['og:url', input.ogUrl],
  ];
  const missing = tags.filter(([, v]) => !v.present).map(([k]) => k);
  const empty = tags.filter(([, v]) => v.present && (v.value ?? '').trim() === '').map(([k]) => k);
  if (missing.length === 0 && empty.length === 0) {
    return { ...base, status: 'pass', evidence: 'All four OG tags present and populated', suggestion: null };
  }
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
  if (empty.length > 0) parts.push(`empty: ${empty.join(', ')}`);
  const suggestionParts: string[] = [];
  if (missing.length > 0) suggestionParts.push(`Add the missing tag(s): ${missing.join(', ')}.`);
  if (empty.length > 0) suggestionParts.push(`Populate the empty tag(s): ${empty.join(', ')} — social platforms treat empty content as absent.`);
  return {
    ...base,
    status: 'fail',
    evidence: parts.join('; '),
    suggestion: suggestionParts.join(' '),
    details: { missing, empty },
  };
}

type OgImageDimsInput = { width: number; height: number } | null;

export function runOgImageDimensionsCheck(input: OgImageDimsInput): CheckResult {
  const base = {
    checkId: 'og_image_dimensions',
    label: 'OG image dimensions (≥1200×630, ~1.91:1)',
    category: 'metadata' as const,
    severity: 'minor' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'Could not probe OG image', suggestion: null };
  }
  const { width, height } = input;
  const minSizeOk = width >= 1200 && height >= 630;
  const ratio = width / height;
  const targetRatio = 1.91;
  const ratioOk = Math.abs(ratio - targetRatio) / targetRatio <= 0.1;

  if (minSizeOk && ratioOk) {
    return { ...base, status: 'pass', evidence: `${width}×${height} (ratio ${ratio.toFixed(2)})`, suggestion: null };
  }
  const reasons: string[] = [];
  if (!minSizeOk) reasons.push(`below 1200×630 (got ${width}×${height})`);
  if (!ratioOk) reasons.push(`aspect ratio ${ratio.toFixed(2)} (target 1.91)`);
  return {
    ...base,
    status: 'warn',
    evidence: reasons.join('; '),
    suggestion: 'Use an OG image that is at least 1200×630 with a 1.91:1 aspect ratio so it renders cleanly on Facebook, LinkedIn, and Slack.',
  };
}

type CanonicalInput = { pageUrl: string; canonicalHref: string | null } | null;

export function runCanonicalUrlCheck(input: CanonicalInput): CheckResult {
  const base = {
    checkId: 'canonical_url',
    label: 'Canonical URL set',
    category: 'technical' as const,
    severity: 'minor' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  if (!input.canonicalHref) {
    return {
      ...base,
      status: 'fail',
      evidence: '<link rel="canonical"> missing',
      suggestion: 'Add a <link rel="canonical"> pointing to this page\'s primary URL to avoid duplicate-content penalties.',
    };
  }
  const norm = (u: string) => {
    try {
      const parsed = new URL(u);
      return `${parsed.hostname}${parsed.pathname.replace(/\/$/, '')}`;
    } catch {
      return u.trim().replace(/\/$/, '');
    }
  };
  const match = norm(input.pageUrl) === norm(input.canonicalHref);
  if (match) {
    return { ...base, status: 'pass', evidence: input.canonicalHref, suggestion: null };
  }
  return {
    ...base,
    status: 'warn',
    evidence: `canonical="${input.canonicalHref}" but page URL is "${input.pageUrl}"`,
    suggestion: 'Canonical URL does not match the page URL — confirm intent; if unintentional, update the canonical tag.',
  };
}

type HttpsInput = { pageUrl: string; html: string } | null;

export function runHttpsAndMixedContentCheck(input: HttpsInput): CheckResult {
  const base = {
    checkId: 'https_and_mixed_content',
    label: 'HTTPS + no mixed content',
    category: 'technical' as const,
    severity: 'critical' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  let pageScheme: string;
  try {
    pageScheme = new URL(input.pageUrl).protocol;
  } catch {
    pageScheme = 'unknown';
  }
  if (pageScheme !== 'https:') {
    return {
      ...base,
      status: 'fail',
      evidence: `Page URL uses ${pageScheme} scheme`,
      suggestion: 'Serve this page over HTTPS — browsers flag HTTP donation pages as insecure.',
    };
  }
  const mixedRefs = input.html.match(/(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi) ?? [];
  if (mixedRefs.length === 0) {
    return { ...base, status: 'pass', evidence: 'HTTPS, no insecure subresources detected', suggestion: null };
  }
  const sample = mixedRefs.slice(0, 3).join('; ');
  return {
    ...base,
    status: 'fail',
    evidence: `${mixedRefs.length} mixed-content reference(s), e.g. ${sample}`,
    suggestion: 'Replace http:// asset URLs with https:// (or protocol-relative //) to prevent browser mixed-content blocking.',
    details: { mixedRefs },
  };
}

type FaviconInput = { faviconHref: string | null; resolves: boolean } | null;

export function runFaviconPresentCheck(input: FaviconInput): CheckResult {
  const base = {
    checkId: 'favicon_present',
    label: 'Favicon present',
    category: 'metadata' as const,
    severity: 'minor' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  if (!input.faviconHref) {
    return {
      ...base,
      status: 'fail',
      evidence: 'No <link rel="icon"> tag found',
      suggestion: 'Add a favicon link tag; browsers show a generic placeholder otherwise, which undermines trust.',
    };
  }
  if (!input.resolves) {
    return {
      ...base,
      status: 'warn',
      evidence: `<link rel="icon" href="${input.faviconHref}"> did not resolve`,
      suggestion: 'Favicon URL returns non-200; fix the asset path or replace with a working favicon.',
    };
  }
  return { ...base, status: 'pass', evidence: input.faviconHref, suggestion: null };
}

type PrivacyTermsInput = { links: Array<{ href: string; text: string }> } | null;
const PRIVACY_PATTERNS = /privacy|data[- ]?protection|gdpr|ccpa/i;
const TERMS_PATTERNS = /terms|conditions|user[- ]?agreement|legal/i;

export function runPrivacyTermsLinksCheck(input: PrivacyTermsInput): CheckResult {
  const base = {
    checkId: 'privacy_terms_links',
    label: 'Privacy / terms links present',
    category: 'compliance' as const,
    severity: 'major' as const,
    confidence: 'heuristic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  const hasPrivacy = input.links.some(
    (l) => PRIVACY_PATTERNS.test(l.href) || PRIVACY_PATTERNS.test(l.text)
  );
  const hasTerms = input.links.some(
    (l) => TERMS_PATTERNS.test(l.href) || TERMS_PATTERNS.test(l.text)
  );
  if (hasPrivacy || hasTerms) {
    const parts: string[] = [];
    if (hasPrivacy) parts.push('privacy');
    if (hasTerms) parts.push('terms');
    return { ...base, status: 'pass', evidence: `Found: ${parts.join(', ')}`, suggestion: null };
  }
  return {
    ...base,
    status: 'fail',
    evidence: 'No privacy or terms link found in page',
    suggestion: 'Add footer links to your privacy policy and terms of service — expected by donors and by most regulators.',
    details: { inventory: input.links },
  };
}

type DonationFormInput = { html: string } | null;
const DONATE_TEXT = /donate|give|contribute|support|pledge|support now/i;

export function runDonationFormRendersCheck(input: DonationFormInput): CheckResult {
  const base = {
    checkId: 'donation_form_renders',
    label: 'Donation form renders',
    category: 'technical' as const,
    severity: 'critical' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  const submitMatch = /<button[^>]*type\s*=\s*["']submit["'][^>]*>/i.test(input.html);
  const donateTextMatch =
    /<button[^>]*>([^<]+)<\/button>/gi.exec(input.html)?.[1]?.match(DONATE_TEXT);

  const allButtons = input.html.match(/<button[^>]*>[^<]+<\/button>/gi) ?? [];
  const anyDonate = allButtons.some((b) => {
    const textMatch = b.match(/>([^<]+)</);
    return textMatch ? DONATE_TEXT.test(textMatch[1]) : false;
  });

  if (submitMatch || donateTextMatch || anyDonate) {
    return { ...base, status: 'pass', evidence: 'Submit or donate-like button detected in rendered DOM', suggestion: null };
  }
  return {
    ...base,
    status: 'fail',
    evidence: `No submit or donate-like button found (scanned ${allButtons.length} buttons)`,
    suggestion: 'The rendered DOM has no donation button — check that the EN form component loaded; this typically blocks all conversions.',
  };
}

type StructuredDataInput = { html: string } | null;

export function runStructuredDataPresentCheck(input: StructuredDataInput): CheckResult {
  const base = {
    checkId: 'structured_data_present',
    label: 'Structured data (JSON-LD) present',
    category: 'metadata' as const,
    severity: 'minor' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  const match = input.html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) {
    return {
      ...base,
      status: 'fail',
      evidence: 'No <script type="application/ld+json"> tag found',
      suggestion: 'Add a JSON-LD block describing the organization and/or the donation offer; improves rich-result eligibility.',
    };
  }
  try {
    JSON.parse(match[1]);
    return { ...base, status: 'pass', evidence: 'Valid JSON-LD block present', suggestion: null };
  } catch {
    return {
      ...base,
      status: 'warn',
      evidence: 'JSON-LD block present but failed to parse',
      suggestion: 'Validate the JSON-LD payload — malformed JSON is ignored by search engines.',
    };
  }
}

type ConsoleEntryLike = { text?: string; url?: string; lineNumber?: number };

type ConsoleErrorsInput = {
  diagnostics: {
    consoleErrors: (ConsoleEntryLike | string)[];
    consoleWarnings: (ConsoleEntryLike | string)[];
  } | null;
} | null;

function formatConsoleEntry(e: ConsoleEntryLike | string): string {
  if (typeof e === 'string') return e;
  const text = e.text ?? '(no text)';
  if (e.url) {
    const short = e.url.replace(/^https?:\/\/[^/]+/, '');
    const loc = e.lineNumber ? `${short}:${e.lineNumber}` : short;
    return `${text} (${loc})`;
  }
  return text;
}

export function runConsoleErrorsCleanCheck(input: ConsoleErrorsInput): CheckResult {
  const base = {
    checkId: 'console_errors_clean',
    label: 'Console errors clean',
    category: 'technical' as const,
    severity: 'critical' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null || input.diagnostics === null) {
    return {
      ...base,
      status: 'skip',
      evidence: 'No diagnostics available — ensure DEEP scan captured console output',
      suggestion: null,
    };
  }
  const errors = input.diagnostics.consoleErrors ?? [];
  const warnings = input.diagnostics.consoleWarnings ?? [];
  if (errors.length === 0 && warnings.length <= 2) {
    return {
      ...base,
      status: 'pass',
      evidence: `0 errors, ${warnings.length} warnings`,
      suggestion: null,
    };
  }
  if (errors.length === 0) {
    return {
      ...base,
      status: 'warn',
      evidence: `0 errors but ${warnings.length} warnings`,
      suggestion: 'Review console warnings — clean output signals quality; warnings often precede errors in the field.',
    };
  }
  const preview = errors.slice(0, 3).map(formatConsoleEntry).join(' | ');
  return {
    ...base,
    status: 'fail',
    evidence: `${errors.length} console error(s): ${preview}${errors.length > 3 ? ' | …' : ''}`,
    suggestion: 'Fix JavaScript errors in the browser console — they often correlate with broken donation flows.',
    details: { errors: errors.map(formatConsoleEntry), warnings: warnings.map(formatConsoleEntry) },
  };
}

type ReadingLevelInput = { appealText: string } | null;

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length === 0) return 0;
  let count = cleaned.replace(/[^aeiouy]+/g, ' ').trim().split(/\s+/).length;
  if (cleaned.endsWith('e') && count > 1) count -= 1;
  return Math.max(1, count);
}

export function runReadingLevelCheck(input: ReadingLevelInput): CheckResult {
  const base = {
    checkId: 'reading_level',
    label: 'Reading level (Flesch-Kincaid ≤ 12)',
    category: 'content' as const,
    severity: 'minor' as const,
    confidence: 'heuristic' as const,
  };
  if (input === null || !input.appealText.trim()) {
    return {
      ...base,
      status: 'skip',
      evidence: 'No appeal text to analyze',
      suggestion: null,
    };
  }
  const text = input.appealText;
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  const wordCount = Math.max(1, words.length);
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllableCount / wordCount) - 15.59;
  const rounded = Math.round(grade * 10) / 10;
  if (grade <= 12) {
    return {
      ...base,
      status: 'pass',
      evidence: `Grade ${rounded} (target ≤ 12)`,
      suggestion: null,
    };
  }
  return {
    ...base,
    status: 'warn',
    evidence: `Grade ${rounded}`,
    suggestion: 'Appeal copy reads above 12th-grade level — shorten sentences and swap long words for plain alternatives.',
  };
}

type TaxReceiptInput = { copyBlocks: string[] } | null;
const TAX_PHRASES = [
  'charitable receipt',
  'tax-deductible',
  'tax deductible',
  'registered charity',
  'receipt for your donation',
  'tax receipt',
];

export function runTaxReceiptLanguageCheck(input: TaxReceiptInput): CheckResult {
  const base = {
    checkId: 'tax_receipt_language_present',
    label: 'Tax-receipt disclosure language',
    category: 'compliance' as const,
    severity: 'major' as const,
    confidence: 'deterministic' as const,
  };
  if (input === null) {
    return { ...base, status: 'skip', evidence: 'No content snapshot available', suggestion: null };
  }
  const combined = input.copyBlocks.join('\n').toLowerCase();
  const matched = TAX_PHRASES.find((p) => combined.includes(p));
  if (matched) {
    return { ...base, status: 'pass', evidence: `Matched phrase: "${matched}"`, suggestion: null };
  }
  return {
    ...base,
    status: 'fail',
    evidence: 'No tax-receipt phrasing detected in copy blocks',
    suggestion: 'Add a clear tax/receipt disclosure (e.g., "Your donation is tax-deductible. You\'ll receive a charitable receipt by email.") — donors expect this assurance.',
  };
}

type SpellingInput = { appealText: string } | null;

export const SPELL_IGNORE_WORDS = [
  'NetDonor',
  'pagejson',
  'Engaging',
  'Crescendo',
  'nonprofit',
  'fundraiser',
  'fundraise',
  'donor',
  'CAD',
  'USD',
];

export async function runSpellingCleanCheck(input: SpellingInput): Promise<CheckResult> {
  const base = {
    checkId: 'spelling_clean',
    label: 'Spelling clean',
    category: 'content' as const,
    severity: 'major' as const,
    confidence: 'heuristic' as const,
  };
  if (input === null || !input.appealText.trim()) {
    return { ...base, status: 'skip', evidence: 'No appeal text to spell-check', suggestion: null };
  }
  try {
    const { spellCheckDocument } = await import('cspell-lib');
    const result = await spellCheckDocument(
      { uri: 'mem://appeal.txt', text: input.appealText, languageId: 'plaintext', locale: 'en' },
      { generateSuggestions: false, noConfigSearch: true },
      { words: SPELL_IGNORE_WORDS }
    );
    const issues = result.issues ?? [];
    if (issues.length === 0) {
      return { ...base, status: 'pass', evidence: '0 misspellings', suggestion: null };
    }
    const flaggedWords = issues.map((i) => i.text);
    const preview = flaggedWords.slice(0, 5).join(', ');
    return {
      ...base,
      status: 'fail',
      evidence: `${issues.length} possible misspelling(s): ${preview}${issues.length > 5 ? '…' : ''}`,
      suggestion: 'Review the full flagged list below; add domain-specific terms to the ignore list if they are false positives.',
      details: { flaggedWords },
    };
  } catch (err) {
    return {
      ...base,
      status: 'skip',
      evidence: `Spell-check engine unavailable: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: null,
    };
  }
}

// --- Orchestrator helpers ---------------------------------------------------

type RawHtml = string;

function extractMetaContent(html: RawHtml, key: string, attr: 'name' | 'property' = 'name'): MetaValue {
  const re = new RegExp(
    `<meta\\s[^>]*${attr}\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? { present: true, value: m[1] } : { present: false, value: null };
}

function extractLinkHref(html: RawHtml, rel: string): string | null {
  const re = new RegExp(
    `<link\\s[^>]*rel\\s*=\\s*["'][^"']*\\b${rel}\\b[^"']*["'][^>]*href\\s*=\\s*["']([^"']*)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractLinkInventory(html: RawHtml): Array<{ href: string; text: string }> {
  if (!html) return [];
  const $ = cheerio.load(html);
  const out: Array<{ href: string; text: string }> = [];
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (href) out.push({ href, text });
  });
  return out;
}

// Exported for tests only.
export const extractLinkInventoryForTest = extractLinkInventory;

async function probeImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ENOptimizer-QA/1.0)' },
      maxContentLength: 2_000_000,
    });
    const buf = Buffer.from(resp.data as ArrayBuffer);
    if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        const segLen = buf.readUInt16BE(i + 2);
        i += 2 + segLen;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function probeUrlResolves(url: string): Promise<boolean> {
  try {
    const resp = await axios.head(url, { timeout: 5000 });
    return resp.status >= 200 && resp.status < 400;
  } catch {
    return false;
  }
}

function safe(name: string, run: () => CheckResult): CheckResult {
  try {
    return run();
  } catch (err) {
    return {
      checkId: name,
      label: name,
      category: 'technical',
      status: 'skip',
      severity: 'minor',
      confidence: 'deterministic',
      evidence: `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: null,
    };
  }
}

async function safeAsync(name: string, run: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await run();
  } catch (err) {
    return {
      checkId: name,
      label: name,
      category: 'technical',
      status: 'skip',
      severity: 'minor',
      confidence: 'deterministic',
      evidence: `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: null,
    };
  }
}

const SKIP_NO_RAW_HTML = 'Pre-migration snapshot — rawHtml missing. Run a new DEEP scan to enable HTML-based checks.';

// --- Public tool export -----------------------------------------------------

export const pageContentAuditTool: ToolSkill = {
  schema: {
    name: 'page_content_audit',
    description:
      'Run a structured quality audit on a fundraising page. Returns ~15 deterministic checks grouped by severity with evidence and suggestions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pageId: { type: 'string', description: 'The FundraisingPage ID to audit.' },
      },
      required: ['pageId'],
    },
  },
  instructions: `Use this tool to run a deterministic quality audit on a fundraising page.

It returns ~15 checks across metadata, content, technical, and compliance categories — each with a status (pass/warn/fail/skip), a hardcoded severity (critical/major/minor), evidence, and a suggestion when applicable.

Call this once per page. Results are structured JSON that you can diff against a previous audit made available via {{previousToolResult:page_content_audit}}.

Do NOT re-run the tool to verify results — a single call covers every check.`,
  async execute(params) {
    const toolLog = createAiToolLogger('page_content_audit');
    const start = Date.now();
    const { pageId } = params as { pageId: string };

    const page = await prisma.fundraisingPage.findUnique({
      where: { id: pageId },
      include: {
        contentSnapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
      },
    });
    if (!page) {
      throw new Error(`FundraisingPage not found: ${pageId}`);
    }

    const snapshot = page.contentSnapshots[0] ?? null;
    const html = snapshot?.rawHtml ?? '';
    const snapshotAvailable = snapshot !== null;
    const rawHtmlAvailable = snapshotAvailable && typeof snapshot!.rawHtml === 'string' && snapshot!.rawHtml.length > 0;

    const metaDescription = rawHtmlAvailable ? extractMetaContent(html, 'description') : null;
    const ogTitle = rawHtmlAvailable ? extractMetaContent(html, 'og:title', 'property') : null;
    const ogDescription = rawHtmlAvailable ? extractMetaContent(html, 'og:description', 'property') : null;
    const ogImage = rawHtmlAvailable ? extractMetaContent(html, 'og:image', 'property') : null;
    const ogUrl = rawHtmlAvailable ? extractMetaContent(html, 'og:url', 'property') : null;
    const canonicalHref = rawHtmlAvailable ? extractLinkHref(html, 'canonical') : null;
    const faviconHref = rawHtmlAvailable ? extractLinkHref(html, 'icon') : null;
    const linkInventory = rawHtmlAvailable ? extractLinkInventory(html) : [];

    const ogImageUrl = ogImage && ogImage.present && ogImage.value ? ogImage.value : null;
    const [ogImageDims, faviconResolves] = await Promise.all([
      ogImageUrl ? probeImageDimensions(ogImageUrl) : Promise.resolve(null),
      snapshotAvailable && faviconHref ? probeUrlResolves(new URL(faviconHref, page.url).toString()) : Promise.resolve(false),
    ]);

    const diagnostics = snapshotAvailable
      ? (snapshot.diagnostics as { consoleErrors?: (ConsoleEntryLike | string)[]; consoleWarnings?: (ConsoleEntryLike | string)[] } | null)
      : null;

    const checks: CheckResult[] = [];

    checks.push(safe('title_present', () =>
      runTitlePresentCheck(snapshotAvailable ? { fundraisingPageName: page.name, metaTitle: snapshot!.metaTitle ?? null } : null)
    ));
    checks.push(safe('title_length', () =>
      runTitleLengthCheck(snapshotAvailable ? { metaTitle: snapshot!.metaTitle ?? null } : null)
    ));
    checks.push(safe('meta_description', () =>
      runMetaDescriptionCheck(rawHtmlAvailable ? { metaDescription: metaDescription! } : null)
    ));
    checks.push(safe('og_tags_complete', () =>
      runOgTagsCompleteCheck(rawHtmlAvailable ? { ogTitle: ogTitle!, ogDescription: ogDescription!, ogImage: ogImage!, ogUrl: ogUrl! } : null)
    ));
    checks.push(safe('og_image_dimensions', () =>
      runOgImageDimensionsCheck(ogImageDims)
    ));
    checks.push(safe('canonical_url', () =>
      runCanonicalUrlCheck(rawHtmlAvailable ? { pageUrl: page.url, canonicalHref } : null)
    ));
    checks.push(safe('https_and_mixed_content', () =>
      runHttpsAndMixedContentCheck(rawHtmlAvailable ? { pageUrl: page.url, html } : null)
    ));
    checks.push(safe('favicon_present', () =>
      runFaviconPresentCheck(rawHtmlAvailable ? { faviconHref, resolves: faviconResolves } : null)
    ));
    checks.push(safe('privacy_terms_links', () =>
      runPrivacyTermsLinksCheck(rawHtmlAvailable ? { links: linkInventory } : null)
    ));
    checks.push(safe('donation_form_renders', () =>
      runDonationFormRendersCheck(rawHtmlAvailable ? { html } : null)
    ));
    checks.push(safe('structured_data_present', () =>
      runStructuredDataPresentCheck(rawHtmlAvailable ? { html } : null)
    ));
    checks.push(safe('console_errors_clean', () =>
      runConsoleErrorsCleanCheck(
        snapshotAvailable
          ? { diagnostics: diagnostics ? { consoleErrors: diagnostics.consoleErrors ?? [], consoleWarnings: diagnostics.consoleWarnings ?? [] } : null }
          : null
      )
    ));
    checks.push(safe('reading_level', () =>
      runReadingLevelCheck(snapshotAvailable && snapshot!.appealText ? { appealText: snapshot!.appealText } : null)
    ));
    checks.push(safe('tax_receipt_language_present', () =>
      runTaxReceiptLanguageCheck(snapshotAvailable ? { copyBlocks: [snapshot!.appealText ?? '', snapshot!.narrativeText ?? ''] } : null)
    ));
    checks.push(
      await safeAsync('spelling_clean', () =>
        runSpellingCleanCheck(snapshotAvailable && snapshot!.appealText ? { appealText: snapshot!.appealText } : null)
      )
    );

    // When we have a snapshot but no rawHtml (pre-migration rows), the 8 HTML-dependent
    // checks skip with a generic message. Override with a specific message so the LLM
    // knows to prompt for a DEEP scan instead of telling the user data is missing.
    if (snapshotAvailable && !rawHtmlAvailable) {
      const htmlCheckIds = new Set([
        'meta_description',
        'og_tags_complete',
        'canonical_url',
        'https_and_mixed_content',
        'favicon_present',
        'privacy_terms_links',
        'donation_form_renders',
        'structured_data_present',
      ]);
      for (const check of checks) {
        if (check.status === 'skip' && htmlCheckIds.has(check.checkId)) {
          check.evidence = SKIP_NO_RAW_HTML;
        }
      }
    }

    const summary = {
      passed: checks.filter((c) => c.status === 'pass').length,
      warnings: checks.filter((c) => c.status === 'warn').length,
      failed: checks.filter((c) => c.status === 'fail').length,
      skipped: checks.filter((c) => c.status === 'skip').length,
    };

    const output: PageContentAuditOutput = {
      checks,
      summary,
      auditedAt: new Date().toISOString(),
      contentSnapshotId: snapshot?.id ?? null,
    };

    const parsed = PageContentAuditOutputSchema.parse(output);
    toolLog.executed(pageId, Date.now() - start, parsed.checks.length);

    return {
      data: parsed,
      summary: `Audit complete: ${summary.passed} pass, ${summary.warnings} warn, ${summary.failed} fail, ${summary.skipped} skip`,
    };
  },
};
