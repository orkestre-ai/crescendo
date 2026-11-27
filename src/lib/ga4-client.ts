import { BetaAnalyticsDataClient, v1alpha } from '@google-analytics/data';
import { getGa4Credentials } from '@/lib/settings';

export interface Ga4Clients {
  data: BetaAnalyticsDataClient;
  alpha: v1alpha.AlphaAnalyticsDataClient;
  propertyId: string;
}

export const GA4_NOT_CONFIGURED =
  'Google Analytics is not configured. Add the GA4 property and service account in Settings.';

// One pair of clients per set of credentials. A report makes hundreds of
// calls; a new client each time would open a new connection and fetch a new
// access token for every one.
let cached: { key: string; clients: Ga4Clients } | null = null;

/**
 * Build the GA4 clients from the credentials saved in Settings, falling back
 * to the environment. Returns null when GA4 is not configured.
 */
export async function getGa4Clients(): Promise<Ga4Clients | null> {
  const ga4 = await getGa4Credentials();
  if (!ga4) return null;

  const key = JSON.stringify([ga4.propertyId, ga4.credentials]);
  if (cached?.key !== key) {
    cached = {
      key,
      clients: {
        data: new BetaAnalyticsDataClient({ credentials: ga4.credentials }),
        alpha: new v1alpha.AlphaAnalyticsDataClient({ credentials: ga4.credentials }),
        propertyId: ga4.propertyId,
      },
    };
  }
  return cached.clients;
}
