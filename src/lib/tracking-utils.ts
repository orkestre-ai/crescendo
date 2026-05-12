/**
 * Utility functions for calculating and displaying tracking accuracy metrics
 * Compares GA4 conversion data to EN donation data
 */

import type { ReportingCurrency } from '@/types/fundraising';

/**
 * Tracking accuracy calculation result
 */
export interface TrackingAccuracyData {
  trackingRate: number | null; // 0-100 percentage, null if unknown
  ga4Count: number;
  enCount: number;
  revenueGap: number; // Untracked revenue estimate
  status: 'good' | 'warning' | 'poor' | 'unknown';
  displayRate: string; // Formatted for display (e.g., "72%", ">100%", "Unknown")
}

/**
 * Options for tracking accuracy calculation
 */
export interface TrackingAccuracyOptions {
  /** GA4 conversion count for the period */
  ga4Conversions: number | null;
  /** EN donation count for the period */
  enDonations: number | null;
  /** EN total revenue for the period */
  enRevenue: number;
  /** Reporting currency for gap calculation */
  currency: ReportingCurrency;
}

/**
 * Calculate tracking accuracy metrics from GA4 and EN data
 *
 * @param options - GA4 and EN data for comparison
 * @returns Tracking accuracy data with rate, counts, and status
 *
 * @example
 * const accuracy = calculateTrackingAccuracy({
 *   ga4Conversions: 36,
 *   enDonations: 50,
 *   enRevenue: 5000,
 *   currency: 'CAD',
 * });
 * // Returns: { trackingRate: 72, ga4Count: 36, enCount: 50, revenueGap: 1400, status: 'warning', displayRate: '72%' }
 */
export function calculateTrackingAccuracy(options: TrackingAccuracyOptions): TrackingAccuracyData {
  const { ga4Conversions, enDonations, enRevenue } = options;

  // Handle unknown cases
  if (ga4Conversions === null && enDonations === null) {
    return {
      trackingRate: null,
      ga4Count: 0,
      enCount: 0,
      revenueGap: 0,
      status: 'unknown',
      displayRate: 'Unknown',
    };
  }

  if (ga4Conversions === null) {
    return {
      trackingRate: null,
      ga4Count: 0,
      enCount: enDonations ?? 0,
      revenueGap: enRevenue,
      status: 'unknown',
      displayRate: 'No GA4 data',
    };
  }

  if (enDonations === null || enDonations === 0) {
    return {
      trackingRate: null,
      ga4Count: ga4Conversions,
      enCount: 0,
      revenueGap: 0,
      status: 'unknown',
      displayRate: 'No EN data',
    };
  }

  // Calculate tracking rate
  const trackingRate = (ga4Conversions / enDonations) * 100;

  // Handle rate > 100% (GA4 tracking more than EN reports - possible with test transactions)
  if (trackingRate > 100) {
    return {
      trackingRate,
      ga4Count: ga4Conversions,
      enCount: enDonations,
      revenueGap: 0, // No gap if we're over-tracking
      status: 'good',
      displayRate: '>100%',
    };
  }

  // Calculate untracked revenue (proportional to untracked transactions)
  const untrackedFraction = 1 - ga4Conversions / enDonations;
  const revenueGap = Math.round(enRevenue * untrackedFraction);

  // Determine status based on tracking rate
  let status: TrackingAccuracyData['status'];
  if (trackingRate >= 90) {
    status = 'good';
  } else if (trackingRate >= 70) {
    status = 'warning';
  } else {
    status = 'poor';
  }

  return {
    trackingRate: Math.round(trackingRate),
    ga4Count: ga4Conversions,
    enCount: enDonations,
    revenueGap,
    status,
    displayRate: `${Math.round(trackingRate)}%`,
  };
}

/**
 * Get tracking status color for UI display
 *
 * @param status - Tracking status
 * @returns Tailwind CSS color class
 */
export function getTrackingStatusColor(status: TrackingAccuracyData['status']): string {
  switch (status) {
    case 'good':
      return 'text-success';
    case 'warning':
      return 'text-warning';
    case 'poor':
      return 'text-destructive';
    case 'unknown':
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get tracking status badge color for UI display
 *
 * @param status - Tracking status
 * @returns Tailwind CSS background color class
 */
export function getTrackingStatusBadgeColor(status: TrackingAccuracyData['status']): string {
  switch (status) {
    case 'good':
      return 'bg-success/10 text-success';
    case 'warning':
      return 'bg-warning/10 text-warning';
    case 'poor':
      return 'bg-destructive/10 text-destructive';
    case 'unknown':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Get human-readable description for tracking status
 *
 * @param status - Tracking status
 * @returns Description string
 */
export function getTrackingStatusDescription(status: TrackingAccuracyData['status']): string {
  switch (status) {
    case 'good':
      return 'Tracking is working well. Most transactions are being captured.';
    case 'warning':
      return 'Some transactions may not be tracked. Consider checking your GA4 setup.';
    case 'poor':
      return 'Significant tracking gap detected. GA4 may be missing many conversions.';
    case 'unknown':
    default:
      return 'Unable to calculate tracking accuracy. Data may be unavailable.';
  }
}
