import type { FundraisingPage } from '@prisma/client';

/**
 * EN API campaignStatus values that can be scraped.
 * - new: Newly created pages
 * - live: Live production pages
 * - tested: Tested pages
 *
 * Non-scrapeable: close, block, delete (return 400 errors)
 */
const SCRAPEABLE_STATUSES = ['new', 'live', 'tested'];

/**
 * Check if a page can be scraped based on its campaign status.
 */
export function isScrapeable(campaignStatus: string | null | undefined): boolean {
  if (!campaignStatus) return false;
  return SCRAPEABLE_STATUSES.includes(campaignStatus.toLowerCase());
}

/**
 * Get the URL to use for scraping.
 * All scrapeable pages use ?mode=DEMO for consistent access.
 */
export function getScrapableUrl(page: Pick<FundraisingPage, 'url'>): string {
  return `${page.url}?mode=DEMO`;
}

/**
 * Campaign statuses that represent published, publicly reachable pages.
 * Only 'live' qualifies — 'new' and 'tested' are pre-launch states
 * (typically PAUSED) that aren't receiving real traffic.
 */
const LIVE_CAMPAIGN_STATUSES = ['live'];

/**
 * Check if a campaign is live (published and receiving public traffic).
 * Used for display filtering — determines which pages appear when
 * the "Show Live Only" toggle is ON, and which get full-opacity rows.
 */
export function isLiveCampaign(campaignStatus: string | null | undefined): boolean {
  if (!campaignStatus) return false;
  return LIVE_CAMPAIGN_STATUSES.includes(campaignStatus.toLowerCase());
}
