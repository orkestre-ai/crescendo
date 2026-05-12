// ============================================================================
// RUNTIME GATEWAY DATA (Extracted via Playwright page.evaluate)
// ============================================================================

/**
 * Gateway variables extracted at runtime via Playwright page.evaluate().
 * EN injects window.EngagingNetworks.paymentGateways and .vault dynamically,
 * so they don't appear in static HTML. This carries the runtime values through
 * to the detection pipeline.
 */
export interface RuntimeGatewayData {
  gateways: unknown[] | null;
  vault: unknown | null;
}

/** Raw EN runtime data extracted via Playwright page.evaluate() */
export interface ENRuntimeRaw {
  feeCover: unknown;
  altLists: unknown[];
  dependencies: unknown[];
  validators: unknown[];
  paymentGateways: unknown[];
  vault: unknown;
  currency: string | null;
}

// ============================================================================
// GATEWAY DETECTION TYPES
// ============================================================================

/**
 * Result of extracting payment gateway variables from EN page HTML.
 * Used by src/lib/gateway-detection.ts extraction functions.
 */
export interface GatewayExtractionResult {
  /** Whether any gateway-related variables were found in the HTML */
  detected: boolean;
  /** The paymentGateways array from window.EngagingNetworks.paymentGateways. null = variable not found. [] = VGS-only. */
  gateways: unknown[] | null;
  /** The vault object from window.EngagingNetworks.vault. null = variable not found. */
  vault: unknown | null;
}

// ============================================================================
// DETECTION STATE (Three-state discriminated union)
// ============================================================================

/**
 * Classified detection result. Discriminated union on `state` field.
 *
 * - gateway-found: paymentGateways array has entries (e.g., Stripe)
 * - vgs-only: paymentGateways is empty [] but vault object present
 * - inconclusive: neither variable found, or scrape failure (Cloudflare block, minimal HTML)
 *
 * CRITICAL: empty array [] means VGS-only, NOT "no gateway". Only null means detection failure.
 */
export type DetectionState =
  | { state: 'gateway-found'; gatewayType: string; gateways: unknown[] }
  | { state: 'vgs-only'; vault: unknown }
  | { state: 'inconclusive'; reason: string };

// ============================================================================
// PAYMENT GATEWAY INFO (Structured result for database persistence)
// ============================================================================

/**
 * Structured gateway detection result for database persistence.
 * Flat single-level object per CONTEXT.md decision.
 * Stored as JSON in FundraisingPage.paymentGateway column.
 */
export interface PaymentGatewayInfo {
  /** All detected gateway types, e.g. ['stripe'] */
  gatewayTypes: string[];
  /** Primary gateway type: 'stripe' | 'vgs-only' | 'inconclusive' | string */
  primaryGateway: string;
  /** Detection outcome: 'gateway-found' | 'vgs-only' | 'inconclusive' */
  detectionState: 'gateway-found' | 'vgs-only' | 'inconclusive';
  /** Payment methods from select[name="transaction.paymenttype"] options, lowercased */
  paymentMethods: string[];
  /** Digital wallet flags from ENgrid body data attributes */
  hasApplePay: boolean;
  hasGooglePay: boolean;
  hasPayPal: boolean;
  hasVenmo: boolean;
  /** Whether Stripe wallet button container exists in DOM */
  hasStripeWalletButtons: boolean;
  /** Whether VGS Collect iframe exists in DOM */
  hasVgsCollectFrame: boolean;
  /** VGS environment: 'live' | 'sandbox' | null */
  vgsEnvironment: 'live' | 'sandbox' | null;
  /** Reason when detectionState is 'inconclusive', null otherwise */
  inconclusiveReason: string | null;
  /** ISO 8601 timestamp of when detection ran */
  detectedAt: string;
}
