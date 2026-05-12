/**
 * Date utility functions for period calculations
 *
 * Used by FundraisingSnapshot collection and UI components
 */

import { startOfDay, subDays, format } from 'date-fns';
import type { PeriodType } from '@prisma/client';

// ============================================================================
// PERIOD CALCULATIONS
// ============================================================================

export interface PeriodDates {
  start: Date;
  end: Date;
}

/**
 * Calculate start and end dates for a given period type
 *
 * Period definitions:
 * - LAST_7_DAYS: today - 6 days to today (inclusive)
 * - PREV_7_DAYS: today - 13 days to today - 7 days (previous 7-day window)
 * - LAST_30_DAYS: today - 29 days to today (inclusive)
 * - LIFETIME: earliest date (1970-01-01) to today (handled specially by caller)
 *
 * @param periodType - The period type to calculate dates for
 * @param referenceDate - The reference date (defaults to today)
 * @returns Object with start and end dates
 */
export function getPeriodDates(
  periodType: PeriodType,
  referenceDate: Date = new Date()
): PeriodDates {
  const today = startOfDay(referenceDate);

  switch (periodType) {
    case 'LAST_7_DAYS':
      return {
        start: subDays(today, 6),
        end: today,
      };
    case 'PREV_7_DAYS':
      return {
        start: subDays(today, 13),
        end: subDays(today, 7),
      };
    case 'LAST_30_DAYS':
      return {
        start: subDays(today, 29),
        end: today,
      };
    case 'LIFETIME':
      // For lifetime, return epoch start; caller should use campaign creation date
      return {
        start: new Date(0),
        end: today,
      };
    default:
      throw new Error(`Unknown period type: ${periodType}`);
  }
}

/**
 * Get period dates with campaign creation date awareness
 *
 * If the campaign was created after the period start,
 * uses the campaign creation date instead.
 *
 * @param periodType - The period type to calculate dates for
 * @param campaignCreatedAt - When the campaign was created in EN
 * @param referenceDate - The reference date (defaults to today)
 * @returns Object with start and end dates, or null if campaign is too new
 */
export function getPeriodDatesForCampaign(
  periodType: PeriodType,
  campaignCreatedAt: Date | null | undefined,
  referenceDate: Date = new Date()
): PeriodDates | null {
  const { start, end } = getPeriodDates(periodType, referenceDate);

  // If no campaign creation date, use calculated period
  if (!campaignCreatedAt) {
    return { start, end };
  }

  const campaignStart = startOfDay(campaignCreatedAt);

  // For LIFETIME, always use campaign creation date as start
  if (periodType === 'LIFETIME') {
    return {
      start: campaignStart,
      end,
    };
  }

  // If campaign was created after the period ends, no data available
  if (campaignStart > end) {
    return null;
  }

  // If campaign was created during the period, adjust start date
  if (campaignStart > start) {
    return {
      start: campaignStart,
      end,
    };
  }

  // Campaign existed before period, use full period
  return { start, end };
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format a date as YYYY-MM-DD string for EN API requests
 *
 * @param date - The date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateYYYYMMDD(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Format a date range as human-readable string
 *
 * @param start - Start date
 * @param end - End date
 * @returns Human-readable date range string
 */
export function formatDateRange(start: Date, end: Date): string {
  const startStr = format(start, 'MMM d');
  const endStr = format(end, 'MMM d, yyyy');
  return `${startStr} - ${endStr}`;
}

/**
 * Get human-readable label for a period type
 *
 * @param periodType - The period type
 * @returns Human-readable label
 */
export function getPeriodLabel(periodType: PeriodType): string {
  switch (periodType) {
    case 'LAST_7_DAYS':
      return 'Last 7 Days';
    case 'PREV_7_DAYS':
      return 'Previous 7 Days';
    case 'LAST_30_DAYS':
      return 'Last 30 Days';
    case 'LIFETIME':
      return 'All Time';
    default:
      return periodType;
  }
}
