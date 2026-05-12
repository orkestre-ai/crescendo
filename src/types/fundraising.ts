/**
 * TypeScript type definitions for EN NetDonor Fundraising API
 * Based on Engaging Networks Public API documentation
 */

import type { PeriodType } from '@prisma/client';

// ============================================================================
// REPORTING CURRENCY
// ============================================================================

/**
 * Supported reporting currencies from EN Public API
 */
export type ReportingCurrency = 'USD' | 'CAD' | 'GBP' | 'EUR' | 'AUD';

/**
 * Valid reporting currency values for validation
 */
export const REPORTING_CURRENCIES: ReportingCurrency[] = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];

/**
 * Check if a string is a valid reporting currency
 */
export function isValidReportingCurrency(value: string): value is ReportingCurrency {
  return REPORTING_CURRENCIES.includes(value as ReportingCurrency);
}

// ============================================================================
// EN PUBLIC API TYPES
// ============================================================================

/**
 * Raw response from EN Public API NetDonor service
 * Note: Field names contain spaces as returned by API
 */
export interface NetDonorApiResponse {
  campaignId: number;
  campaignName: string;
  pageHits: number;
  registrations: number;
  participatingSupporters: number;
  'total amount donated': number;
  'highest amount donated': number;
  'average amount donated': number;
}

/**
 * EN Public API error response format
 */
export interface NetDonorApiError {
  error: string;
}

/**
 * Type guard to check if response is an error
 */
export function isNetDonorError(
  response: NetDonorApiResponse | NetDonorApiError
): response is NetDonorApiError {
  return 'error' in response && typeof response.error === 'string';
}

// ============================================================================
// NORMALIZED INTERNAL TYPES
// ============================================================================

/**
 * Normalized fundraising data for internal use
 * Field names are camelCased and amounts converted to dollars
 */
export interface FundraisingData {
  campaignId: number;
  campaignName: string;
  pageHits: number;
  registrations: number;
  supporters: number;
  totalDonated: number; // In dollars (converted from cents)
  highestDonation: number; // In dollars (converted from cents)
  averageDonation: number; // Already in dollars from API
  fetchedAt: Date;
}

/**
 * Prisma update input for FundraisingPage model
 */
export interface FundraisingUpdateInput {
  fundraisingTotalDonated: number;
  fundraisingHighestDonation: number;
  fundraisingAverageDonation: number;
  fundraisingRegistrations: number;
  fundraisingSupporters: number;
  fundraisingPageHits: number;
  fundraisingLastFetchedAt: Date;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * API route response for /api/pages/[id]/fundraising
 */
export interface FundraisingApiResponse {
  success: boolean;
  data?: FundraisingApiData;
  error?: string;
}

/**
 * Fundraising data returned by API routes (serializable)
 */
export interface FundraisingApiData {
  campaignId: number;
  campaignName: string;
  totalDonated: number;
  highestDonation: number;
  averageDonation: number;
  registrations: number;
  supporters: number;
  pageHits: number;
  fetchedAt: string; // ISO date string
}

// ============================================================================
// UI DISPLAY TYPES
// ============================================================================

/**
 * Formatted fundraising data for UI display
 */
export interface FundraisingDisplay {
  totalDonated: string; // Formatted currency string, e.g., "$2,027,049.35"
  highestDonation: string; // Formatted currency string
  averageDonation: string; // Formatted currency string
  registrations: number;
  supporters: number;
  pageHits: number;
  lastFetchedAt: string | null; // ISO date string or null
  hasData: boolean; // Whether any data has been fetched
  isStale: boolean; // Whether data is older than 24 hours
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Transform raw API response to normalized internal format
 *
 * NOTE: EN API returns all monetary amounts in dollars (not cents)
 * - 'total amount donated': In dollars (e.g., 264987.67)
 * - 'highest amount donated': In dollars (e.g., 15050 = $15,050.00)
 * - 'average amount donated': In dollars (e.g., 221.01)
 */
export function normalizeNetDonorResponse(response: NetDonorApiResponse): FundraisingData {
  return {
    campaignId: response.campaignId,
    campaignName: response.campaignName,
    pageHits: response.pageHits,
    registrations: response.registrations,
    supporters: response.participatingSupporters,
    // All monetary amounts are already in dollars from EN API
    totalDonated: response['total amount donated'],
    highestDonation: response['highest amount donated'],
    averageDonation: response['average amount donated'],
    fetchedAt: new Date(),
  };
}

/**
 * Transform normalized data to Prisma update input
 */
export function toFundraisingUpdateInput(data: FundraisingData): FundraisingUpdateInput {
  return {
    fundraisingTotalDonated: data.totalDonated,
    fundraisingHighestDonation: data.highestDonation,
    fundraisingAverageDonation: data.averageDonation,
    fundraisingRegistrations: data.registrations,
    fundraisingSupporters: data.supporters,
    fundraisingPageHits: data.pageHits,
    fundraisingLastFetchedAt: data.fetchedAt,
  };
}

/**
 * Transform normalized data to API response format
 */
export function toFundraisingApiData(data: FundraisingData): FundraisingApiData {
  return {
    campaignId: data.campaignId,
    campaignName: data.campaignName,
    totalDonated: data.totalDonated,
    highestDonation: data.highestDonation,
    averageDonation: data.averageDonation,
    registrations: data.registrations,
    supporters: data.supporters,
    pageHits: data.pageHits,
    fetchedAt: data.fetchedAt.toISOString(),
  };
}

// ============================================================================
// FUNDRAISING SUMMARY BY PAGE (Period-based)
// ============================================================================

/**
 * Raw response from EN Public API FundraisingSummaryByPage service
 * Returns donation counts and amounts by currency for a date range
 */
export interface FundraisingSummaryByPageResponse {
  ID: number;
  NAME: string;
  TOTAL_NUMBER: number;
  TOTAL_AMOUNT_USD: number;
  TOTAL_AMOUNT_CAD: number;
  TOTAL_AMOUNT_GBP: number;
  TOTAL_AMOUNT_EUR: number;
  TOTAL_AMOUNT_AUD: number;
  TOTAL_NUMBER_SINGLE: number;
  TOTAL_AMOUNT_SINGLE_USD: number;
  TOTAL_AMOUNT_SINGLE_CAD: number;
  TOTAL_AMOUNT_SINGLE_GBP: number;
  TOTAL_AMOUNT_SINGLE_EUR: number;
  TOTAL_AMOUNT_SINGLE_AUD: number;
  TOTAL_NUMBER_RECURRING: number;
  TOTAL_AMOUNT_RECURRING_USD: number;
  TOTAL_AMOUNT_RECURRING_CAD: number;
  TOTAL_AMOUNT_RECURRING_GBP: number;
  TOTAL_AMOUNT_RECURRING_EUR: number;
  TOTAL_AMOUNT_RECURRING_AUD: number;
}

/**
 * Normalized fundraising summary data for internal use
 * Currency-specific amounts extracted based on reportingCurrency setting
 */
export interface FundraisingSummaryData {
  pageId: number;
  pageName: string;
  period: {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
  };
  totalAmount: number;
  donationCount: number;
  singleCount: number;
  singleAmount: number;
  recurringCount: number;
  recurringAmount: number;
  currency: ReportingCurrency;
  fetchedAt: Date;
}

/**
 * Prisma create/update input for FundraisingSnapshot model
 */
export interface FundraisingSnapshotInput {
  pageId: string;
  periodType: PeriodType;
  periodStart: Date;
  periodEnd: Date;
  totalAmount: number;
  donationCount: number;
  singleCount: number;
  singleAmount: number;
  recurringCount: number;
  recurringAmount: number;
  highestDonation?: number;
  averageDonation?: number;
  supporters?: number;
  currency: string;
  fetchedAt: Date;
}

/**
 * Currency field mapping for FundraisingSummaryByPage response
 */
const CURRENCY_FIELD_MAP: Record<
  ReportingCurrency,
  {
    total: keyof FundraisingSummaryByPageResponse;
    single: keyof FundraisingSummaryByPageResponse;
    recurring: keyof FundraisingSummaryByPageResponse;
  }
> = {
  USD: {
    total: 'TOTAL_AMOUNT_USD',
    single: 'TOTAL_AMOUNT_SINGLE_USD',
    recurring: 'TOTAL_AMOUNT_RECURRING_USD',
  },
  CAD: {
    total: 'TOTAL_AMOUNT_CAD',
    single: 'TOTAL_AMOUNT_SINGLE_CAD',
    recurring: 'TOTAL_AMOUNT_RECURRING_CAD',
  },
  GBP: {
    total: 'TOTAL_AMOUNT_GBP',
    single: 'TOTAL_AMOUNT_SINGLE_GBP',
    recurring: 'TOTAL_AMOUNT_RECURRING_GBP',
  },
  EUR: {
    total: 'TOTAL_AMOUNT_EUR',
    single: 'TOTAL_AMOUNT_SINGLE_EUR',
    recurring: 'TOTAL_AMOUNT_RECURRING_EUR',
  },
  AUD: {
    total: 'TOTAL_AMOUNT_AUD',
    single: 'TOTAL_AMOUNT_SINGLE_AUD',
    recurring: 'TOTAL_AMOUNT_RECURRING_AUD',
  },
};

/**
 * Transform raw FundraisingSummaryByPage API response to normalized format
 *
 * @param response - Raw API response
 * @param currency - Reporting currency to extract amounts for
 * @param startDate - Period start date (YYYY-MM-DD)
 * @param endDate - Period end date (YYYY-MM-DD)
 * @returns Normalized fundraising summary data
 */
export function normalizeFundraisingSummary(
  response: FundraisingSummaryByPageResponse,
  currency: ReportingCurrency,
  startDate: string,
  endDate: string
): FundraisingSummaryData {
  const fields = CURRENCY_FIELD_MAP[currency];

  return {
    pageId: response.ID,
    pageName: response.NAME,
    period: {
      startDate,
      endDate,
    },
    totalAmount: response[fields.total] as number,
    donationCount: response.TOTAL_NUMBER,
    singleCount: response.TOTAL_NUMBER_SINGLE,
    singleAmount: response[fields.single] as number,
    recurringCount: response.TOTAL_NUMBER_RECURRING,
    recurringAmount: response[fields.recurring] as number,
    currency,
    fetchedAt: new Date(),
  };
}

// ============================================================================
// UI COMPONENT PROPS (for page detail sections)
// ============================================================================

/**
 * Props for RecentPerformanceSection component
 * Displays 7-day metrics with period-over-period comparison
 */
export interface RecentPerformanceProps {
  current: {
    revenue: number;
    donors: number;
    singleCount: number;
    recurringCount: number;
    avgGift: number;
  };
  previous?: {
    revenue: number;
    donors: number;
    avgGift: number;
  };
  currency: ReportingCurrency;
  periodLabel: string; // e.g., "Last 7 Days"
}

/**
 * Props for ThirtyDaySummary component
 */
export interface ThirtyDaySummaryProps {
  revenue: number;
  donors: number;
  singleCount: number;
  recurringCount: number;
  currency: ReportingCurrency;
}

/**
 * Props for LifetimeTotals component
 */
export interface LifetimeTotalsProps {
  totalRevenue: number;
  supporters: number;
  highestDonation: number;
  averageDonation: number;
  sinceDate: Date;
  currency: ReportingCurrency;
}

/**
 * Props for TrackingAccuracy component
 */
export interface TrackingAccuracyProps {
  trackingRate: number | null; // 0-100 or null if unknown
  ga4Count: number;
  enCount: number;
  revenueGap: number;
  currency: ReportingCurrency;
}
