import type { ENRuntimeData, ENFeeCoverConfig, ENPaymentGateway } from '@/types/en-runtime';
import type { ENRuntimeRaw } from '@/types/gateway';

/**
 * Parse raw window.EngagingNetworks data into structured ENRuntimeData.
 * Handles missing/malformed data gracefully — returns defaults for any field that fails.
 */
export function parseENRuntimeData(raw: ENRuntimeRaw): ENRuntimeData {
  return {
    feeCover: parseFeeCover(raw.feeCover),
    ...parseDonationAmounts(raw.altLists, raw.dependencies),
    minDonationAmount: parseMinAmount(raw.validators),
    currency: raw.currency || null,
    paymentGateways: parsePaymentGateways(raw.paymentGateways),
    vault: parseVault(raw.vault),
  };
}

function parseFeeCover(raw: unknown): ENFeeCoverConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  // EN nests it: feeCover.feeCover
  const inner = (obj.feeCover ?? obj) as Record<string, unknown>;
  if (!inner.type) return null;
  return {
    type: String(inner.type),
    percent: String(inner.percent ?? '0'),
    maxAmount: String(inner.maxAmount ?? '0'),
    additionalAmount: inner.additionalAmount ? String(inner.additionalAmount) : null,
  };
}

/**
 * Extract one-time and monthly donation amounts from EN altLists + dependencies.
 *
 * Algorithm:
 * 1. Find the dependency where condition value === "MONTHLY" and action type === "altlist"
 * 2. Get the altList target field ID and monthly altList name (e.g., "alt1")
 * 3. Look up the altList by field ID
 * 4. Extract numeric values from alt0 (one-time) and alt1 (monthly)
 */
function parseDonationAmounts(
  altLists: unknown[],
  dependencies: unknown[]
): {
  donationAmounts: number[];
  monthlyDonationAmounts: number[];
  hasMonthlyGiving: boolean;
} {
  const result = {
    donationAmounts: [] as number[],
    monthlyDonationAmounts: [] as number[],
    hasMonthlyGiving: false,
  };

  if (!Array.isArray(altLists) || !Array.isArray(dependencies)) return result;

  // Step 1: Find the MONTHLY dependency with an altlist action
  let targetFieldId: string | null = null;
  let monthlyAltName: string | null = null;

  for (const dep of dependencies) {
    const d = dep as Record<string, unknown>;
    const conditions = d.conditions as Array<Record<string, unknown>> | undefined;
    const actions = d.actions as Array<Record<string, unknown>> | undefined;
    if (!conditions || !actions) continue;

    const isMonthly = conditions.some((c) => c.value === 'MONTHLY');
    if (!isMonthly) continue;

    const altAction = actions.find((a) => a.type === 'altlist');
    if (altAction) {
      targetFieldId = String(altAction.target);
      monthlyAltName = String(altAction.altlist);
      break;
    }
  }

  // Step 2: Find the altList for the donation amount field
  for (const al of altLists) {
    const list = al as Record<string, unknown>;
    const fieldId = String(list.id ?? '');
    const groups = list.data as Array<Record<string, unknown>> | undefined;
    if (!groups) continue;

    // Match by targetFieldId from dependency, or by having amount-like values
    const isTarget = targetFieldId && fieldId === targetFieldId;
    if (!isTarget) {
      // Check if this altList has numeric values (donation amounts, not provinces)
      const firstGroup = groups[0];
      if (!firstGroup) continue;
      const items = (firstGroup as Record<string, unknown>).data as
        | Array<Record<string, unknown>>
        | undefined;
      if (
        !items?.some(
          (item) => !isNaN(parseFloat(String(item.value))) && parseFloat(String(item.value)) > 0
        )
      )
        continue;
      // Only use this fallback if there's no explicit target
      if (targetFieldId) continue;
    }

    for (const group of groups) {
      const g = group as Record<string, unknown>;
      const name = String(g.name ?? '');
      const items = (g.data as Array<Record<string, unknown>> | undefined) ?? [];

      const amounts = items
        .map((item) => parseFloat(String(item.value)))
        .filter((n) => !isNaN(n) && n > 0)
        .sort((a, b) => a - b);

      if (name === 'alt0') {
        result.donationAmounts = amounts;
      } else if (monthlyAltName && name === monthlyAltName) {
        result.monthlyDonationAmounts = amounts;
        result.hasMonthlyGiving = true;
      }
    }

    break; // Found the donation field altList
  }

  return result;
}

function parseMinAmount(validators: unknown[]): number | null {
  if (!Array.isArray(validators)) return null;
  for (const v of validators) {
    const val = v as Record<string, unknown>;
    if (val.type === 'AMNT' && val.format) {
      const min = parseFloat(String(val.format));
      if (!isNaN(min) && min > 0) return min;
    }
  }
  return null;
}

function parsePaymentGateways(raw: unknown[]): ENPaymentGateway[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((gw) => gw && typeof gw === 'object')
    .map((gw) => {
      const g = gw as Record<string, unknown>;
      return {
        gateway: String(g.gateway ?? 'unknown'),
        country: String(g.country ?? ''),
        currency: String(g.currency ?? ''),
      };
    });
}

function parseVault(raw: unknown): { environment: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.environment === 'live' || v.environment === 'sandbox') {
    return { environment: String(v.environment) };
  }
  return null;
}

/**
 * Build a sanitized EN config snapshot for storage.
 * Strips sensitive fields (Stripe keys, VGS vault IDs, route IDs).
 */
export function buildSanitizedConfig(raw: ENRuntimeRaw): Record<string, unknown> {
  return {
    feeCover: raw.feeCover ?? null,
    paymentGateways: Array.isArray(raw.paymentGateways)
      ? raw.paymentGateways.map((gw: unknown) => {
          const g = gw as Record<string, unknown>;
          return {
            gateway: g?.gateway,
            country: g?.country,
            currency: g?.currency,
          };
        })
      : [],
    vault: raw.vault ? { environment: (raw.vault as Record<string, unknown>)?.environment } : null,
    dependencyCount: Array.isArray(raw.dependencies) ? raw.dependencies.length : 0,
    altListCount: Array.isArray(raw.altLists) ? raw.altLists.length : 0,
    validatorCount: Array.isArray(raw.validators) ? raw.validators.length : 0,
  };
}
