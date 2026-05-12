/**
 * Sanitized data extracted from window.EngagingNetworks at runtime.
 * Sensitive fields (Stripe keys, VGS vault IDs) are redacted.
 */
export interface ENRuntimeData {
  feeCover: ENFeeCoverConfig | null;
  donationAmounts: number[];
  monthlyDonationAmounts: number[];
  hasMonthlyGiving: boolean;
  minDonationAmount: number | null;
  currency: string | null;
  paymentGateways: ENPaymentGateway[];
  vault: { environment: string } | null;
}

export interface ENFeeCoverConfig {
  type: string; // "PERCENT" | "FIXED"
  percent: string; // e.g. "3"
  maxAmount: string; // e.g. "50"
  additionalAmount: string | null;
}

export interface ENPaymentGateway {
  gateway: string; // e.g. "stripe"
  country: string; // e.g. "CA"
  currency: string; // e.g. "any"
}
