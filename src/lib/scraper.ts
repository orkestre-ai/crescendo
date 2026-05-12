import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import type { PageContent } from '@/types';
import { extractGatewayInfo } from '@/lib/gateway-detection';
import type { PaymentGatewayInfo, RuntimeGatewayData, ENRuntimeRaw } from '@/types/gateway';
import { CloudflareBlockedError, ValidationError } from '@/lib/errors';
import { scrapeWithBrowser, closeBrowser } from '@/lib/playwright-scraper';
import { parseENRuntimeData, buildSanitizedConfig } from '@/lib/en-runtime-parser';
import { SCRAPER_MAX_DONATION_AMOUNT } from '@/config/constants';
import { rootLogger } from '@/lib/logging';

const log = rootLogger.child({ journey: 'scraper' });

// Create a cookie-aware axios instance
const createCookieClient = () => {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));
  return client;
};

export interface ScraperOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

// Hosts that have returned a Cloudflare 403 in this process. Subsequent URLs
// on the same host skip the wasted axios round-trip and go straight to
// Playwright. Self-heals on process restart.
const knownCloudflareHosts = new Set<string>();

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function markHostCloudflareBlocked(url: string): void {
  const host = hostnameOf(url);
  if (host) knownCloudflareHosts.add(host);
}

function isHostCloudflareBlocked(url: string): boolean {
  const host = hostnameOf(url);
  return host !== null && knownCloudflareHosts.has(host);
}

export const __cloudflareCache = {
  has: isHostCloudflareBlocked,
  mark: markHostCloudflareBlocked,
  clear: () => knownCloudflareHosts.clear(),
};

export class PageScraper {
  private concurrencyLimit = 5;

  // Suffix-matched defaults for EN-owned hosts. Anything matching
  // *.engagingnetworks.app or *.e-activist.com is trusted automatically.
  private static readonly BUILTIN_ALLOWED_SUFFIXES = [
    'engagingnetworks.app',
    'e-activist.com',
  ];

  // Exact-match hosts trusted at runtime — populated from FundraisingPage.url
  // (which is synced from EN's authenticated REST API). Lets the scraper reach
  // CNAMEd donation pages like secured.oxfam.ca without operator config.
  private trustedHosts: Set<string> = new Set();

  setTrustedHosts(hosts: Iterable<string>): void {
    this.trustedHosts = new Set(hosts);
  }

  private isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const onBuiltin = PageScraper.BUILTIN_ALLOWED_SUFFIXES.some(
        (d) => host === d || host.endsWith('.' + d)
      );
      return onBuiltin || this.trustedHosts.has(host);
    } catch {
      return false;
    }
  }

  /**
   * Extract main title from page using multiple fallback selectors
   * Tries various common patterns used by different EN clients
   */
  private extractTitle($: cheerio.CheerioAPI): string | null {
    const selectors = [
      'h1', // Standard H1
      '.page-title h1', // Wrapped H1
      '.en__component--page-title h1', // EN page title component
      '.en__component--page-title h2', // EN using H2
      '.page-title', // Page title class
      '.headline', // Headline class
      '[class*="page-title"]', // Contains page-title
      '[class*="main-title"]', // Contains main-title
      '[class*="heading"]:first', // Contains heading
      'header h1', // H1 in header
      'header h2', // H2 in header
      '.hero h1', // Hero section H1
      '.hero h2', // Hero section H2
      'h2.title', // H2 with title class
    ];

    for (const selector of selectors) {
      const text = $(selector).first().text().trim();
      if (text && text.length > 0 && text.length < 200) {
        return text;
      }
    }

    return null;
  }

  /**
   * Extract the HTML <title> tag content (page name in browser tab / search results)
   */
  private extractMetaTitle($: cheerio.CheerioAPI): string | null {
    const title = $('title').first().text().trim();
    return title && title.length > 0 && title.length < 500 ? title : null;
  }

  /**
   * Extract appeal/body text from the EN .body-top section
   * EN pages use a consistent template structure:
   *   .en__component--advcolumn.body-top
   *     └── .en__component--copyblock
   *         ├── <h1-h6> (optional heading)
   *         ├── <p> (appeal paragraphs)
   *         └── <li> (list items)
   */
  private extractAppealText($: cheerio.CheerioAPI): string | null {
    const copyblock = $('.body-top .en__component--copyblock');
    if (copyblock.length === 0) {
      return null;
    }

    const blocks: string[] = [];
    copyblock.children('h1, h2, h3, h4, h5, h6, p, li').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 0) {
        blocks.push(text);
      }
    });

    if (blocks.length === 0) {
      return null;
    }

    const appealText = blocks.join('\n\n').trim();
    return appealText.length > 0 ? appealText : null;
  }

  /**
   * Extract campaign description text
   * Looks for meta description and common description patterns
   */
  private extractDescription($: cheerio.CheerioAPI): string | null {
    // Try meta description first
    const metaDesc = $('meta[name="description"]').attr('content')?.trim();
    if (metaDesc && metaDesc.length > 10) {
      return metaDesc;
    }

    // Try Open Graph description
    const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
    if (ogDesc && ogDesc.length > 10) {
      return ogDesc;
    }

    // Try common description selectors
    const descSelectors = [
      '.page-description',
      '.campaign-description',
      '.description',
      '[class*="description"]',
      '.en__component--text p',
      '.intro',
      '.lead',
      'header p',
    ];

    for (const selector of descSelectors) {
      const text = $(selector).first().text().trim();
      if (text && text.length > 10 && text.length < 500) {
        return text;
      }
    }

    return null;
  }

  /**
   * Extract CTA button text
   * Tries various button and link patterns
   */
  private extractCTA($: cheerio.CheerioAPI): string[] {
    const cta: string[] = [];

    const ctaSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.en__submit button',
      '.en__submit input',
      'button.donate-button',
      'button.cta-button',
      'button.btn-primary',
      'button.btn-donate',
      'a.donate-button',
      'a.cta-button',
      'a.btn-donate',
      '[class*="donate-btn"]',
      '[class*="cta-btn"]',
      'button[class*="donate"]',
      'button[class*="submit"]',
    ];

    $(ctaSelectors.join(', ')).each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim() || $el.attr('value')?.trim();

      // Filter out empty, too long, or generic text
      if (text && text.length > 0 && text.length < 50 && text.toLowerCase() !== 'submit') {
        cta.push(text);
      }
    });

    return [...new Set(cta)]; // Remove duplicates
  }

  /**
   * Extract the displayed fee cover dollar amount to exclude from donation amounts.
   * Returns the numeric fee amount, or null if no fee cover on page.
   */
  private extractFeeCoverDisplayAmount($: cheerio.CheerioAPI): number | null {
    const feeSpan = $('[data-token="amount-fee"]');
    if (feeSpan.length === 0) return null;
    const text = feeSpan.text().trim();
    const match = text.match(/\$?\s*(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
    return null;
  }

  /**
   * Detect fee cover presence from DOM (works with cheerio, no JS needed).
   */
  private detectFeeCover($: cheerio.CheerioAPI): boolean {
    return (
      $('input[name="transaction.feeCover"]').length > 0 || $('.en__field--feeCover').length > 0
    );
  }

  /**
   * Extract donation amounts from various patterns
   * Handles different EN client implementations
   */
  private extractDonationAmounts($: cheerio.CheerioAPI): number[] {
    const amounts = new Set<number>();
    const extractions: Array<{
      pattern: string;
      selector: string;
      tag: string;
      classes: string;
      id: string;
      rawValue: string;
      parsed: number;
    }> = [];

    // Detect fee cover to exclude its dollar amount from donation amounts
    const feeCoverAmount = this.extractFeeCoverDisplayAmount($);

    const logExtraction = (
      pattern: string,
      selector: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      el: any,
      rawValue: string,
      amount: number
    ) => {
      const $el = $(el);
      extractions.push({
        pattern,
        selector,
        tag: el.tagName || 'unknown',
        classes: $el.attr('class') || '',
        id: $el.attr('id') || '',
        rawValue: rawValue.substring(0, 100),
        parsed: amount,
      });
    };

    // Pattern 1: Input values (most common)
    const p1Selector =
      'input[name="transaction.donationAmt"], .en__field__item--donationAmt input, input[name*="amount"], input[type="radio"][name*="donation"]';
    $(p1Selector).each((_, el) => {
      const value = $(el).attr('value');
      if (value) {
        const amount = parseFloat(value.replace(/[^0-9.]/g, ''));
        if (!isNaN(amount) && amount > 0 && amount <= SCRAPER_MAX_DONATION_AMOUNT) {
          // Skip fee cover dollar amount (e.g. $4.50 = 3% of $150)
          if (feeCoverAmount !== null && Math.abs(amount - feeCoverAmount) < 0.01) {
            return;
          }
          amounts.add(amount);
          logExtraction('P1:input-value', p1Selector, el, value, amount);
        }
      }
    });

    // Pattern 2: Data attributes
    const p2Selector = '[data-amount], [data-donation-amount], .donation-amount, .amount-option';
    $(p2Selector).each((_, el) => {
      const $el = $(el);
      const dataAmount =
        $el.data('amount') || $el.data('donation-amount') || $el.attr('data-amount');

      if (dataAmount) {
        const amount = parseFloat(String(dataAmount).replace(/[^0-9.]/g, ''));
        if (!isNaN(amount) && amount > 0 && amount <= SCRAPER_MAX_DONATION_AMOUNT) {
          if (feeCoverAmount !== null && Math.abs(amount - feeCoverAmount) < 0.01) {
            return;
          }
          amounts.add(amount);
          logExtraction('P2:data-attr', p2Selector, el, String(dataAmount), amount);
        }
      }

      // Also try text content
      const text = $el.text().trim();
      if (text) {
        const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
        if (!isNaN(amount) && amount > 0 && amount <= SCRAPER_MAX_DONATION_AMOUNT) {
          if (feeCoverAmount !== null && Math.abs(amount - feeCoverAmount) < 0.01) {
            return;
          }
          amounts.add(amount);
          logExtraction('P2:text-content', p2Selector, el, text, amount);
        }
      }
    });

    // Pattern 3: Labels with dollar amounts
    const p3Selector = 'label[for*="amount"], .amount-label, [class*="donation-amount"]';
    $(p3Selector).each((_, el) => {
      const text = $(el).text();
      // Look for patterns like $25, $100, etc.
      const matches = text.match(/\$\s*(\d+(?:\.\d{2})?)/g);
      if (matches) {
        matches.forEach((match) => {
          const amount = parseFloat(match.replace(/[^0-9.]/g, ''));
          if (!isNaN(amount) && amount > 0 && amount <= SCRAPER_MAX_DONATION_AMOUNT) {
            if (feeCoverAmount !== null && Math.abs(amount - feeCoverAmount) < 0.01) {
              return;
            }
            amounts.add(amount);
            logExtraction('P3:label-dollar', p3Selector, el, match, amount);
          }
        });
      }
    });

    const sorted = Array.from(amounts).sort((a, b) => a - b);

    // Verbose debug logging for donation amount extraction
    log.debug(
      { event: 'scraper.donationAmounts', amounts: sorted, extractionCount: extractions.length },
      `Found ${sorted.length} unique amounts: [${sorted.join(', ')}]`
    );

    return sorted;
  }

  /**
   * Extract pageJson variable from script tags
   * This contains page flow metadata like page number, whether transaction processes on this page, etc.
   */
  private extractPageJson($: cheerio.CheerioAPI): {
    pageNumber?: number | null;
    pageCount?: number | null;
    redirectPresent?: boolean | null;
    giftProcess?: boolean | null;
  } {
    let pageNumber: number | null = null;
    let pageCount: number | null = null;
    let redirectPresent: boolean | null = null;
    let giftProcess: boolean | null = null;

    $('script').each((_, scriptElement) => {
      const scriptContent = $(scriptElement).html();
      if (scriptContent && scriptContent.includes('var pageJson =')) {
        // Match: var pageJson = {...};
        const match = scriptContent.match(/var pageJson = ({.*?});/);
        if (match && match[1]) {
          try {
            const pageJson = JSON.parse(match[1]);

            // Extract useful fields
            pageNumber = typeof pageJson.pageNumber === 'number' ? pageJson.pageNumber : null;
            pageCount = typeof pageJson.pageCount === 'number' ? pageJson.pageCount : null;
            redirectPresent =
              typeof pageJson.redirectPresent === 'boolean' ? pageJson.redirectPresent : null;
            giftProcess = typeof pageJson.giftProcess === 'boolean' ? pageJson.giftProcess : null;

            return false; // Stop iterating
          } catch (parseError) {
            log.warn({ err: parseError instanceof Error ? parseError : undefined, event: 'scraper.pageJson.parseFailed' }, 'Failed to parse pageJson');
          }
        }
      }
    });

    return { pageNumber, pageCount, redirectPresent, giftProcess };
  }

  /**
   * Extract all narrative text content for LLM context
   * Includes headings, paragraphs, lists - preserves structure
   * Excludes: footer, nav, form fields, scripts, styles
   */
  private extractNarrativeText($: cheerio.CheerioAPI): string | null {
    // Clone the DOM to avoid modifying original
    const html = $.html();
    const $clone = cheerio.load(html);

    // Remove footer elements (common selectors + keyword-based)
    $clone('footer, [role="contentinfo"], nav, [role="navigation"]').remove();
    $clone('[class*="footer"], [id*="footer"]').remove();
    $clone('[class*="privacy"], [class*="terms"], [class*="copyright"]').remove();

    // Remove non-content elements
    $clone('script, style, noscript, iframe').remove();

    // Remove form FIELDS but not the form container (EN pages wrap everything in forms)
    $clone('input, textarea, select, button, label[for]').remove();

    // Extract text from narrative elements
    const narrativeElements = $clone(
      'h1, h2, h3, h4, h5, h6, p, li, blockquote, .description, .content, .text, [class*="description"], [class*="content"], [class*="hero"], [class*="intro"]'
    );

    const textBlocks: string[] = [];
    const seen = new Set<string>();

    narrativeElements.each((_, el) => {
      const $el = $clone(el);

      // Get only direct text, not nested elements
      let text = $el.clone().children().remove().end().text().trim();

      // If no direct text, get all text
      if (!text) {
        text = $el.text().trim();
      }

      // Skip empty, very short, or duplicate content
      if (!text || text.length < 10 || seen.has(text)) {
        return;
      }

      // Skip form-related text patterns
      if (text.match(/^\$\d+(\.\d{2})?$/)) {
        // Just dollar amounts
        return;
      }
      if (
        text.match(
          /^(amount|donate|submit|next|previous|back|continue|close|loading\.{3}|learn more)$/i
        )
      ) {
        return;
      }
      if (text.match(/^(billing|payment|credit card|security code)/i)) {
        return; // Skip form section headers
      }

      // Skip error messages and validation text
      if (text.match(/(error processing|is required|please correct|following error occurred)/i)) {
        return;
      }

      // Skip modal/popup prompts (monthly donor upsells, etc.)
      if (text.match(/(yes, upgrade|not now|become a monthly donor)/i)) {
        return;
      }

      // Skip template variable names
      if (text.includes('~') && text.match(/-panel_\d+_/)) {
        return;
      }

      // Skip very technical/system messages
      if (text.includes('256bit SSL') || text.includes('security code on the front or back')) {
        return;
      }

      seen.add(text);

      // Determine element type for formatting
      const tagName = $el.prop('tagName')?.toLowerCase();
      if (tagName?.match(/^h[1-6]$/)) {
        // Headings get extra line break before
        textBlocks.push('\n' + text);
      } else {
        textBlocks.push(text);
      }
    });

    if (textBlocks.length === 0) {
      return null;
    }

    // Join with paragraph breaks, clean up excess whitespace
    let narrative = textBlocks.join('\n\n');
    narrative = narrative.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    narrative = narrative.trim();

    return narrative.length > 0 ? narrative : null;
  }

  async scrapePage(
    url: string,
    options: ScraperOptions = {},
    runtimeENData?: ENRuntimeRaw | null
  ): Promise<PageContent> {
    if (!this.isAllowedUrl(url)) {
      let hostname: string;
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = url;
      }
      throw new ValidationError(`URL not on allowlist: ${hostname}`, {
        url,
        allowedSuffixes: PageScraper.BUILTIN_ALLOWED_SUFFIXES,
        trustedHosts: Array.from(this.trustedHosts),
      });
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let html: string;
    let runtimeGateway: RuntimeGatewayData | null = null;
    let usedPlaywright = false;

    // Short-circuit known CF-blocked hosts: skip the doomed axios attempt entirely
    if (isHostCloudflareBlocked(url)) {
      log.debug({ event: 'scraper.cloudflare.host_skip', url }, `Skipping axios for known CF-blocked host: ${url}`);
      const result = await scrapeWithBrowser(url, { timeoutMs: Math.max(timeoutMs, 30000) });
      html = result.html;
      runtimeGateway = result.runtimeGateway;
      runtimeENData = result.enRuntimeRaw;
      usedPlaywright = true;
      if (html.includes('_cf_chl_opt')) {
        throw new Error(`Playwright also blocked by Cloudflare for ${url}`);
      }
    } else {
      let client: ReturnType<typeof createCookieClient> | null = null;
      try {
        // Primary path: fast axios fetch
        client = createCookieClient();
        const { data } = await client.get(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          timeout: timeoutMs,
          maxRedirects: 10,
        });

        // Check for Cloudflare challenge in 200 response (CF sometimes returns 200 with challenge HTML)
        if (
          data.includes('_cf_chl_opt') ||
          data.includes('cf-mitigated') ||
          (data.includes('Just a moment') && data.length < 10000)
        ) {
          throw new CloudflareBlockedError(url);
        }

        html = data;
      } catch (error) {
        if (error instanceof CloudflareBlockedError) {
          // Fallback: use headless browser to bypass Cloudflare
          markHostCloudflareBlocked(url);
          log.info({ event: 'scraper.cloudflare.detected', url }, `Cloudflare detected for ${url}, retrying with Playwright`);
          const result = await scrapeWithBrowser(url, { timeoutMs: Math.max(timeoutMs, 30000) });
          html = result.html;
          runtimeGateway = result.runtimeGateway;
          runtimeENData = result.enRuntimeRaw;
          usedPlaywright = true;

          // Verify we got real content, not another challenge
          if (html.includes('_cf_chl_opt')) {
            throw new Error(`Playwright also blocked by Cloudflare for ${url}`);
          }
        } else {
          // Non-CF errors: check if it's a CF 403 in the error response
          const axiosError = error as any;
          if (
            axiosError.response?.status === 403 &&
            (axiosError.response?.headers?.['cf-mitigated']?.includes?.('challenge') ||
              axiosError.response?.data?.includes?.('_cf_chl_opt'))
          ) {
            markHostCloudflareBlocked(url);
            log.info({ event: 'scraper.cloudflare.403', url }, `Cloudflare 403 for ${url}, retrying with Playwright`);
            const result = await scrapeWithBrowser(url, { timeoutMs: Math.max(timeoutMs, 30000) });
            html = result.html;
            runtimeGateway = result.runtimeGateway;
            runtimeENData = result.enRuntimeRaw;
            usedPlaywright = true;

            if (html.includes('_cf_chl_opt')) {
              throw new Error(`Playwright also blocked by Cloudflare for ${url}`);
            }
          } else {
            // Real error -- re-throw with existing error handling
            const errorDetails = {
              message: axiosError.message,
              code: axiosError.code,
              status: axiosError.response?.status,
              url,
              timeoutMs,
            };
            log.error({ event: 'scraper.fetch.failed', ...errorDetails }, `Failed to scrape ${url}`);
            throw new Error(
              `Scraping failed for ${url}: ${axiosError.code || axiosError.message || 'Unknown error'}`
            );
          }
        }
      } finally {
        client?.defaults.httpAgent?.destroy?.();
        client?.defaults.httpsAgent?.destroy?.();
      }
    }

    return this.parseHtml(url, html, {
      runtimeGateway,
      runtimeENData: runtimeENData ?? null,
      usedPlaywright,
    });
  }

  /**
   * Parse already-fetched HTML into a PageContent. Used by scrapePage and by
   * callers that obtained HTML from a different source (e.g. capturePageBundle
   * during FILLING_MISSING) to avoid a second navigation.
   */
  parseHtml(
    url: string,
    html: string,
    context: {
      runtimeGateway?: RuntimeGatewayData | null;
      runtimeENData?: ENRuntimeRaw | null;
      usedPlaywright?: boolean;
    } = {}
  ): PageContent {
    const runtimeGateway = context.runtimeGateway ?? null;
    const runtimeENData = context.runtimeENData ?? null;
    const usedPlaywright = context.usedPlaywright ?? false;

    if (html.length < 5000) {
      log.warn({ event: 'scraper.minimal_html', url, htmlLength: html.length }, `Minimal HTML received for ${url} (${html.length} bytes) - may be closed or unavailable`);
    }

    const $ = cheerio.load(html);
    const h1 = this.extractTitle($);
    const metaDescription = this.extractDescription($);
    const cta = this.extractCTA($);
    const cheerioDonationAmounts = this.extractDonationAmounts($);
    const pageJsonData = this.extractPageJson($);
    const narrativeText = this.extractNarrativeText($);
    const metaTitle = this.extractMetaTitle($);
    const appealText = this.extractAppealText($);

    let paymentGateway: PaymentGatewayInfo | null = null;
    try {
      paymentGateway = extractGatewayInfo(html, runtimeGateway);
    } catch (error) {
      log.warn({ event: 'scraper.gateway.failed', err: error instanceof Error ? error : undefined, url }, `Gateway detection failed for ${url}`);
    }

    let donationAmounts = cheerioDonationAmounts;
    let monthlyDonationAmounts: number[] = [];
    let hasFeeCover = this.detectFeeCover($);
    let feeCoverConfig: PageContent['feeCoverConfig'] = null;
    let hasMonthlyGiving = false;
    let currency: string | null = null;
    let minDonationAmount: number | null = null;
    let enRuntimeData: PageContent['enRuntimeData'] = null;
    let enRuntimeConfig: Record<string, unknown> | null = null;

    if (runtimeENData) {
      const parsed = parseENRuntimeData(runtimeENData);
      enRuntimeData = parsed;

      if (parsed.donationAmounts.length > 0) {
        donationAmounts = parsed.donationAmounts;
      }
      monthlyDonationAmounts = parsed.monthlyDonationAmounts;
      hasMonthlyGiving = parsed.hasMonthlyGiving;
      currency = parsed.currency;
      minDonationAmount = parsed.minDonationAmount;

      if (parsed.feeCover) {
        hasFeeCover = true;
        feeCoverConfig = parsed.feeCover;
      }

      enRuntimeConfig = buildSanitizedConfig(runtimeENData);
    }

    return {
      url,
      h1,
      metaDescription,
      cta,
      donationAmounts,
      scrapedAt: new Date(),
      narrativeText,
      rawHtml: html,
      metaTitle,
      appealText,
      ...pageJsonData,
      paymentGateway,
      usedPlaywright,
      monthlyDonationAmounts,
      hasFeeCover,
      feeCoverConfig,
      hasMonthlyGiving,
      currency,
      minDonationAmount,
      enRuntimeData,
      enRuntimeConfig,
    };
  }

  /**
   * Scrape multiple pages in parallel using p-limit for concurrency control.
   * Known Playwright pages skip the HTTP attempt. Reports progress via callback.
   */
  async scrapePagesParallel(
    pages: Array<{ url: string; requiresPlaywright: boolean }>,
    options: ScraperOptions & { concurrency?: number } = {},
    onProgress?: (url: string, result: PageContent | Error) => void | Promise<void>
  ): Promise<Map<string, PageContent>> {
    const { default: pLimit } = await import('p-limit');
    const concurrency = options.concurrency ?? 3;
    const limit = pLimit(concurrency);
    const results = new Map<string, PageContent>();

    const tasks = pages.map(({ url, requiresPlaywright: needsPlaywright }) =>
      limit(async () => {
        try {
          let content: PageContent;
          if (needsPlaywright) {
            // Skip HTTP attempt for known Cloudflare pages
            const result = await scrapeWithBrowser(url, {
              timeoutMs: Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30000),
            });
            const $ = cheerio.load(result.html);
            const enRaw = result.enRuntimeRaw;

            // Parse EN runtime data
            let enFields: Partial<PageContent> = {};
            if (enRaw) {
              const parsed = parseENRuntimeData(enRaw);
              enFields = {
                monthlyDonationAmounts: parsed.monthlyDonationAmounts,
                hasFeeCover: parsed.feeCover !== null || this.detectFeeCover($),
                feeCoverConfig: parsed.feeCover,
                hasMonthlyGiving: parsed.hasMonthlyGiving,
                currency: parsed.currency,
                minDonationAmount: parsed.minDonationAmount,
                enRuntimeData: parsed,
                enRuntimeConfig: buildSanitizedConfig(enRaw),
              };
            }

            const donationAmounts = enFields.enRuntimeData?.donationAmounts?.length
              ? enFields.enRuntimeData.donationAmounts
              : this.extractDonationAmounts($);

            content = {
              url,
              h1: this.extractTitle($),
              metaDescription: this.extractDescription($),
              cta: this.extractCTA($),
              donationAmounts,
              scrapedAt: new Date(),
              narrativeText: this.extractNarrativeText($),
              rawHtml: result.html,
              metaTitle: this.extractMetaTitle($),
              appealText: this.extractAppealText($),
              ...this.extractPageJson($),
              paymentGateway: (() => {
                try {
                  return extractGatewayInfo(result.html, result.runtimeGateway);
                } catch {
                  return null;
                }
              })(),
              usedPlaywright: true,
              ...enFields,
            };
          } else {
            content = await this.scrapePage(url, options);
          }
          results.set(url, content);
          await onProgress?.(url, content);
        } catch (error) {
          results.set(url, {
            url,
            h1: null,
            metaDescription: null,
            cta: [],
            donationAmounts: [],
            scrapedAt: new Date(),
            paymentGateway: null,
            scrapeFailed: true,
          });
          await onProgress?.(url, error as Error);
        }
      })
    );

    await Promise.allSettled(tasks);
    return results;
  }

  async scrapePages(urls: string[]): Promise<Map<string, PageContent>> {
    const results = new Map<string, PageContent>();
    const queue = [...urls];

    // Process in batches with concurrency limit
    while (queue.length > 0) {
      const batch = queue.splice(0, this.concurrencyLimit);
      const promises = batch.map((url) =>
        this.scrapePage(url)
          .then((content) => results.set(url, content))
          .catch((error) => {
            log.error({ event: 'scraper.batch.page.failed', err: error instanceof Error ? error : undefined, url }, `Failed to scrape ${url}`);
            // Store minimal data on error
            results.set(url, {
              url,
              h1: null,
              metaDescription: null,
              cta: [],
              donationAmounts: [],
              scrapedAt: new Date(),
              paymentGateway: null,
              scrapeFailed: true,
            });
          })
      );
      await Promise.all(promises);
    }

    return results;
  }

  async scrapeWithRetry(
    url: string,
    options: ScraperOptions = {},
    maxRetries = 3
  ): Promise<PageContent> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.scrapePage(url, options);
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
    throw new Error('Max retries exceeded');
  }

  async cleanup(): Promise<void> {
    await closeBrowser();
  }
}

export const scraper = new PageScraper();
