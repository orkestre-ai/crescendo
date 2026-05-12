/**
 * Gateway detection library for EN donation pages.
 *
 * Extracts payment gateway configuration from page HTML by parsing
 * inline script variables (window.EngagingNetworks.paymentGateways
 * and window.EngagingNetworks.vault). Used by the scraping pipeline
 * to classify each page's payment processing setup.
 *
 * Follows the same cheerio-based script iteration pattern as
 * PageScraper.extractPageJson() in src/lib/scraper.ts.
 *
 * Phase 2 will import these functions into PageScraper.scrapePage()
 * to add gateway classification to the scrape results.
 */
import * as cheerio from 'cheerio';
import { rootLogger } from '@/lib/logging';
import type {
  GatewayExtractionResult,
  DetectionState,
  PaymentGatewayInfo,
  RuntimeGatewayData,
} from '@/types/gateway';

const log = rootLogger.child({ module: 'gateway-detection' });

/**
 * Check if HTML is a Cloudflare challenge page.
 *
 * Cloudflare challenge pages are returned as 403 responses when
 * server-side requests hit protected EN domains. They contain
 * characteristic markers that distinguish them from real page HTML.
 *
 * @param html - Raw HTML string to check
 * @returns true if the HTML is a Cloudflare challenge page
 */
export function isCloudflareChallenge(html: string): boolean {
  return (
    html.includes('Just a moment...') &&
    (html.includes('_cf_chl_opt') || html.includes('/cdn-cgi/challenge-platform/'))
  );
}

/**
 * Extract payment gateway variables from EN page HTML.
 *
 * Parses the HTML with cheerio and searches inline script tags for
 * window.EngagingNetworks.paymentGateways and window.EngagingNetworks.vault.
 *
 * IMPORTANT: paymentGateways is a multiline JSON array, so the regex uses
 * [\s\S]*? instead of .*? to match across line breaks. This differs from
 * the extractPageJson pattern in scraper.ts which works without dotall
 * because pageJson is always single-line.
 *
 * @param html - Raw HTML string to parse
 * @returns Extraction result with detected flag, gateways array, and vault object
 */
export function extractPaymentGateways(html: string): GatewayExtractionResult {
  const $ = cheerio.load(html);
  let gateways: unknown[] | null = null;
  let vault: unknown | null = null;

  $('script').each((_, scriptElement) => {
    const content = $(scriptElement).html();
    if (!content || !content.includes('EngagingNetworks')) return;

    // Extract paymentGateways array (multiline — MUST use [\s\S]*?)
    const gwMatch = content.match(/paymentGateways\s*=\s*(\[[\s\S]*?\]);/);
    if (gwMatch?.[1]) {
      try {
        gateways = JSON.parse(gwMatch[1]);
      } catch (err) {
        log.warn({ err }, 'Failed to parse paymentGateways JSON from inline script');
      }
    }

    // Extract vault object (multiline — MUST use [\s\S]*?)
    const vaultMatch = content.match(/vault\s*=\s*(\{[\s\S]*?\});/);
    if (vaultMatch?.[1]) {
      try {
        vault = JSON.parse(vaultMatch[1]);
      } catch (err) {
        log.warn({ err }, 'Failed to parse vault JSON from inline script');
      }
    }
  });

  const detected = gateways !== null || vault !== null;
  return { detected, gateways, vault };
}

/**
 * Classify page HTML into one of three detection states.
 *
 * Orchestrates Cloudflare detection, minimal HTML check, and
 * gateway variable extraction to produce a discriminated union result.
 *
 * States:
 * - gateway-found: paymentGateways has entries (e.g., Stripe)
 * - vgs-only: paymentGateways is [] but vault present, OR vault present without gateways
 * - inconclusive: Cloudflare block, minimal HTML, or no gateway variables found
 *
 * @param html - Raw HTML string to classify
 * @returns DetectionState discriminated union
 */
export function classifyDetection(
  html: string,
  preExtracted?: GatewayExtractionResult | null
): DetectionState {
  // Check for Cloudflare challenge first
  if (isCloudflareChallenge(html)) {
    return { state: 'inconclusive', reason: 'Cloudflare challenge page' };
  }

  // Check for minimal HTML (closed page, error page, empty response).
  // Threshold is 500 bytes — real EN pages (even condensed) are well above this,
  // while truly empty/error responses are under a few hundred bytes.
  if (html.length < 500) {
    return {
      state: 'inconclusive',
      reason: `Minimal HTML (${html.length} bytes)`,
    };
  }

  // Use pre-extracted data (from Playwright runtime) when available,
  // otherwise fall back to regex extraction from static HTML
  const result = preExtracted ?? extractPaymentGateways(html);

  // Gateway array populated — extract gateway type from first entry
  if (result.gateways !== null && result.gateways.length > 0) {
    const first = result.gateways[0] as Record<string, unknown>;
    return {
      state: 'gateway-found',
      gatewayType: String(first.gateway || 'unknown'),
      gateways: result.gateways,
    };
  }

  // Empty gateway array + vault present = VGS-only
  if (result.gateways !== null && result.gateways.length === 0 && result.vault !== null) {
    return { state: 'vgs-only', vault: result.vault };
  }

  // Vault present without gateways array = also VGS-only
  if (result.vault !== null) {
    return { state: 'vgs-only', vault: result.vault };
  }

  return {
    state: 'inconclusive',
    reason: 'No gateway variables found in HTML',
  };
}

// ============================================================================
// PHASE 2: Structured Gateway Info Extraction
// ============================================================================

/**
 * Extract accepted payment methods from the payment type select dropdown.
 *
 * EN pages use a <select name="transaction.paymenttype"> with options
 * like "Visa", "Mastercard", "Amex". Values are lowercased for consistency.
 *
 * @param $ - Cheerio instance with loaded HTML
 * @returns Array of lowercased payment method strings
 */
function extractPaymentMethods($: cheerio.CheerioAPI): string[] {
  const methods: string[] = [];
  $('select[name="transaction.paymenttype"] option').each((_, el) => {
    const value = $(el).attr('value');
    if (value && value.trim()) {
      methods.push(value.trim().toLowerCase());
    }
  });
  return methods;
}

/**
 * Extract digital wallet support flags from ENgrid body data attributes.
 *
 * ENgrid sets data-engrid-payment-type-option-* attributes on the body
 * element to indicate which payment types are available. Runs independently
 * of gateway type since wallet availability is a page-level concern.
 *
 * @param $ - Cheerio instance with loaded HTML
 * @returns Object with boolean flags for each wallet type
 */
function extractDigitalWallets($: cheerio.CheerioAPI): {
  hasApplePay: boolean;
  hasGooglePay: boolean;
  hasPayPal: boolean;
  hasVenmo: boolean;
} {
  const body = $('body');
  return {
    hasApplePay: body.attr('data-engrid-payment-type-option-applepay') === 'true',
    hasGooglePay: body.attr('data-engrid-payment-type-option-googlepay') === 'true',
    hasPayPal: body.attr('data-engrid-payment-type-option-paypal') === 'true',
    hasVenmo: body.attr('data-engrid-payment-type-option-venmo') === 'true',
  };
}

/**
 * Check for Stripe-specific DOM elements.
 *
 * The Stripe digital wallet button container (#en__digitalWallet__stripeButtons)
 * is present on pages with Stripe gateway configured.
 *
 * @param $ - Cheerio instance with loaded HTML
 * @returns true if Stripe wallet button container exists
 */
function hasStripeElements($: cheerio.CheerioAPI): boolean {
  return $('#en__digitalWallet__stripeButtons').length > 0;
}

/**
 * Check for VGS Collect iframe signatures.
 *
 * VGS-based pages use iframes with name="vgs-collect-cvv-field" or
 * class names containing "vgs-collect" for secure card input.
 *
 * @param $ - Cheerio instance with loaded HTML
 * @returns true if VGS Collect iframe elements exist
 */
function hasVgsElements($: cheerio.CheerioAPI): boolean {
  return (
    $('iframe[name="vgs-collect-cvv-field"]').length > 0 || $('[class*="vgs-collect"]').length > 0
  );
}

/**
 * Extract VGS environment from the vault object.
 *
 * @param vault - The vault object from extractPaymentGateways, or null
 * @returns 'live', 'sandbox', or null if vault is absent or environment unknown
 */
function extractVgsEnvironment(vault: unknown): 'live' | 'sandbox' | null {
  if (vault === null || vault === undefined) return null;
  const v = vault as Record<string, unknown>;
  const env = v.environment;
  if (env === 'live' || env === 'sandbox') return env;
  return null;
}

/**
 * Extract gateway type strings from the raw gateways array.
 *
 * Each entry in the paymentGateways array has a `gateway` field
 * (e.g., "stripe"). Only the type string is extracted -- sensitive
 * fields (key, accountId) are never included.
 *
 * @param gateways - The raw gateways array from extractPaymentGateways
 * @returns Array of gateway type strings
 */
function extractGatewayTypes(gateways: unknown[]): string[] {
  return gateways
    .map((gw) => {
      const g = gw as Record<string, unknown>;
      return g.gateway ? String(g.gateway) : null;
    })
    .filter((t): t is string => t !== null);
}

/**
 * Extract structured gateway information from EN page HTML.
 *
 * Composes Phase 1 detection functions (classifyDetection, extractPaymentGateways)
 * with additional DOM extraction for payment methods, digital wallets, and
 * gateway-specific elements. Returns a flat PaymentGatewayInfo object suitable
 * for database persistence.
 *
 * SENSITIVE DATA: Only gateway type strings (e.g., 'stripe') and capability
 * flags are included. Raw gateway objects containing Stripe publishable keys,
 * account IDs, VGS vault IDs, and route IDs are NEVER included in the output.
 *
 * @param html - Raw HTML string to analyze
 * @returns PaymentGatewayInfo object with all detection results
 */
export function extractGatewayInfo(
  html: string,
  runtimeGateway?: RuntimeGatewayData | null
): PaymentGatewayInfo {
  const $ = cheerio.load(html);

  // When runtime gateway data is available (Playwright path), build
  // a GatewayExtractionResult from it and pass to classifyDetection
  // to skip regex extraction from static HTML.
  let preExtracted: GatewayExtractionResult | null = null;
  if (runtimeGateway) {
    preExtracted = {
      detected: runtimeGateway.gateways !== null || runtimeGateway.vault !== null,
      gateways: runtimeGateway.gateways,
      vault: runtimeGateway.vault,
    };
  }

  // Use Phase 1 functions for core detection
  const detection = classifyDetection(html, preExtracted);
  const rawResult = preExtracted ?? extractPaymentGateways(html);

  // Extract additional info from DOM
  const paymentMethods = extractPaymentMethods($);
  const wallets = extractDigitalWallets($);
  const stripeWalletButtons = hasStripeElements($);
  const vgsCollectFrame = hasVgsElements($);
  const vgsEnvironment = extractVgsEnvironment(rawResult.vault);

  // Build the structured result based on detection state
  let gatewayTypes: string[] = [];
  let primaryGateway: string;
  let detectionState: 'gateway-found' | 'vgs-only' | 'inconclusive';
  let inconclusiveReason: string | null = null;

  if (detection.state === 'gateway-found') {
    gatewayTypes = extractGatewayTypes(detection.gateways);
    primaryGateway = detection.gatewayType;
    detectionState = 'gateway-found';
  } else if (detection.state === 'vgs-only') {
    gatewayTypes = [];
    primaryGateway = 'vgs-only';
    detectionState = 'vgs-only';
  } else {
    // inconclusive
    gatewayTypes = [];
    primaryGateway = 'inconclusive';
    detectionState = 'inconclusive';
    inconclusiveReason = detection.reason;
  }

  return {
    gatewayTypes,
    primaryGateway,
    detectionState,
    paymentMethods,
    hasApplePay: wallets.hasApplePay,
    hasGooglePay: wallets.hasGooglePay,
    hasPayPal: wallets.hasPayPal,
    hasVenmo: wallets.hasVenmo,
    hasStripeWalletButtons: stripeWalletButtons,
    hasVgsCollectFrame: vgsCollectFrame,
    vgsEnvironment,
    inconclusiveReason,
    detectedAt: new Date().toISOString(),
  };
}
