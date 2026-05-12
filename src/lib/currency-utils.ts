/**
 * Currency formatting utilities for fundraising data display
 */

import type { ReportingCurrency } from '@/types/fundraising';

/**
 * Format a number as currency
 *
 * @param amount - Amount in the specified currency
 * @param currency - Currency code (USD, CAD, GBP, EUR, AUD) - defaults to USD
 * @param options - Intl.NumberFormat options
 * @returns Formatted currency string, e.g., "$2,027,049.35" or "£1,234.56"
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: ReportingCurrency = 'USD',
  options?: Intl.NumberFormatOptions
): string {
  if (amount == null) {
    return formatZeroCurrency(currency);
  }

  // Use appropriate locale for currency formatting
  const locale = getLocaleForCurrency(currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/**
 * Get appropriate locale for currency formatting
 */
function getLocaleForCurrency(currency: ReportingCurrency): string {
  switch (currency) {
    case 'GBP':
      return 'en-GB';
    case 'EUR':
      return 'de-DE'; // Use German locale for EUR (common)
    case 'AUD':
      return 'en-AU';
    case 'CAD':
      return 'en-CA';
    case 'USD':
    default:
      return 'en-US';
  }
}

/**
 * Format zero amount with correct currency symbol
 */
function formatZeroCurrency(currency: ReportingCurrency): string {
  return formatCurrency(0, currency);
}

/**
 * Format a number with thousand separators
 *
 * @param value - Number to format
 * @returns Formatted string with commas, e.g., "1,234,567"
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) {
    return '0';
  }

  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Currency symbol mapping for compact formatting
 */
const CURRENCY_SYMBOLS: Record<ReportingCurrency, string> = {
  USD: '$',
  CAD: 'CA$',
  GBP: '£',
  EUR: '€',
  AUD: 'A$',
};

/**
 * Format a currency amount compactly for display in tight spaces
 *
 * @param amount - Amount in the specified currency
 * @param currency - Currency code (defaults to USD)
 * @returns Compact string like "$1.2M" or "£45K"
 */
export function formatCurrencyCompact(
  amount: number | null | undefined,
  currency: ReportingCurrency = 'USD'
): string {
  if (amount == null) {
    return `${CURRENCY_SYMBOLS[currency]}0`;
  }

  const symbol = CURRENCY_SYMBOLS[currency];

  if (amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (amount >= 1_000) {
    return `${symbol}${(amount / 1_000).toFixed(1)}K`;
  }

  return formatCurrency(amount, currency, { maximumFractionDigits: 0 });
}

/**
 * Convert cents to dollars
 *
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Convert dollars to cents
 *
 * @param dollars - Amount in dollars
 * @returns Amount in cents (rounded to nearest cent)
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
