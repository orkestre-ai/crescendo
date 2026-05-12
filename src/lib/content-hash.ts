import { createHash } from 'crypto';

/**
 * Fields included in the content hash per D-01.
 * These are the user-facing scraped fields that affect fundraising performance.
 * Structural metadata (pageNumber, pageCount, redirectPresent), gateway detection,
 * and fee cover config are excluded per D-02.
 */
export interface HashableFields {
  h1: string | null;
  metaDescription: string | null;
  metaTitle: string | null;
  appealText: string | null;
  narrativeText: string | null;
  ctaButtons: string[];
  donationAmounts: number[];
  monthlyDonationAmounts: number[];
}

/**
 * Compute a deterministic sha256 hash from key user-facing scraped fields.
 * Used to detect meaningful content changes between scrapes.
 *
 * Normalization rules:
 * - Null/undefined fields become empty string
 * - String arrays are sorted alphabetically
 * - Number arrays are sorted numerically and rounded to 2 decimal places
 * - JSON.stringify on the normalized object produces deterministic output
 */
export function computeContentHash(fields: HashableFields): string {
  const normalized = {
    h1: fields.h1 ?? '',
    metaDescription: fields.metaDescription ?? '',
    metaTitle: fields.metaTitle ?? '',
    appealText: fields.appealText ?? '',
    narrativeText: fields.narrativeText ?? '',
    ctaButtons: [...fields.ctaButtons].sort(),
    donationAmounts: [...fields.donationAmounts]
      .map((n) => Math.round(n * 100) / 100)
      .sort((a, b) => a - b),
    monthlyDonationAmounts: [...fields.monthlyDonationAmounts]
      .map((n) => Math.round(n * 100) / 100)
      .sort((a, b) => a - b),
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
