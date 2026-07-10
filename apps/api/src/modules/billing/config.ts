export type Tier = "free" | "pro" | "business";
export type Feature = "audit_log" | "api" | "sso";

export interface Entitlement {
  rank: number;
  features: Feature[];
  maxMembers: number;
}

export const ENTITLEMENTS: Record<Tier, Entitlement> = {
  free: { rank: 0, features: [], maxMembers: 3 },
  pro: { rank: 1, features: ["audit_log", "api"], maxMembers: 20 },
  business: {
    rank: 2,
    features: ["audit_log", "api", "sso"],
    maxMembers: Number.POSITIVE_INFINITY,
  },
};

export const PAID_TIERS = ["pro", "business"] as const satisfies readonly Exclude<Tier, "free">[];

export function isTier(value: string): value is Tier {
  return value === "free" || value === "pro" || value === "business";
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

export function hasSeatAvailable(activeMembers: number, maxMembers: number): boolean {
  return activeMembers < maxMembers;
}
