/**
 * Determine whether a page should be ACTIVE or PAUSED based on its EN campaignStatus
 * and the includeNonLive setting.
 *
 * - 'live' → always ACTIVE
 * - 'new'/'tested' → ACTIVE only if includeNonLive is true
 * - 'close'/'block'/'delete' → always PAUSED
 * - null/undefined (detail fetch failed) → PAUSED
 */
export function determinePageStatus(
  campaignStatus: string | null | undefined,
  includeNonLive: boolean
): 'ACTIVE' | 'PAUSED' {
  if (!campaignStatus) return 'PAUSED';
  const status = campaignStatus.toLowerCase();
  if (status === 'live') return 'ACTIVE';
  if ((status === 'new' || status === 'tested') && includeNonLive) return 'ACTIVE';
  return 'PAUSED';
}
