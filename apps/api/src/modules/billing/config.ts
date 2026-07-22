export type Tier = "free" | "pro" | "business";
export type Feature = "audit_log" | "api" | "sso";
export type QuotaKey = "uploads" | "projects" | "apiCallsPerMonth";

export interface Entitlement {
  rank: number;
  features: Feature[];
  maxMembers: number | null;
  quotas: Record<QuotaKey, number | null>;
}

export const ENTITLEMENTS: Record<Tier, Entitlement> = {
  free: {
    rank: 0,
    features: [],
    maxMembers: 3,
    quotas: { uploads: 10, projects: 3, apiCallsPerMonth: 1_000 },
  },
  pro: {
    rank: 1,
    features: ["audit_log", "api"],
    maxMembers: 20,
    quotas: { uploads: 100, projects: 20, apiCallsPerMonth: 50_000 },
  },
  business: {
    rank: 2,
    features: ["audit_log", "api", "sso"],
    maxMembers: null,
    quotas: { uploads: null, projects: null, apiCallsPerMonth: null },
  },
};

export function isTier(value: string): value is Tier {
  return value in ENTITLEMENTS;
}

export function entitlementsForTier(tier: string): Entitlement {
  return isTier(tier) ? ENTITLEMENTS[tier] : ENTITLEMENTS.free;
}

export function rankOf(tier: Tier): number {
  return ENTITLEMENTS[tier].rank;
}

export interface EntitlementsView extends Entitlement {
  tier: Tier;
  status: string;
}

export function hasFeature(view: EntitlementsView, flag: Feature): boolean {
  return view.features.includes(flag);
}

export function meetsPlan(view: EntitlementsView, minTier: Tier): boolean {
  return view.rank >= rankOf(minTier);
}

export function hasSeatAvailable(activeMembers: number, maxMembers: number | null): boolean {
  return maxMembers === null || activeMembers < maxMembers;
}

export function quotaLimit(view: EntitlementsView, key: QuotaKey): number | null {
  return view.quotas[key];
}

export function hasQuotaRemaining(used: number, limit: number | null): boolean {
  return limit === null || used < limit;
}
