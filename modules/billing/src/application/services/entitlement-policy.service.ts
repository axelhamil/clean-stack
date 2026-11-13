import type { Tier } from "@packages/access-control";
import type { Option } from "@packages/ddd-kit";
import type { ActivePlanOverride } from "../ports/repositories/plan-override.port";
import type { SubscriptionRow } from "../ports/repositories/subscription-read.port";

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
  return Object.hasOwn(ENTITLEMENTS, value);
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
  hasSubscription: boolean;
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

const OVERRIDE_STATUS = "override";

export function freeView(hasSubscription = false): EntitlementsView {
  return { tier: "free", status: "free", hasSubscription, ...entitlementsForTier("free") };
}

export function viewOf(
  subscription: Option<SubscriptionRow>,
  override: Option<ActivePlanOverride>,
  hasSubscription: boolean,
): EntitlementsView {
  const overrideTier = override.map(({ tier }) => tier).toNull();

  if (overrideTier !== null && isTier(overrideTier)) {
    const status = subscription.isSome() ? subscription.unwrap().status : OVERRIDE_STATUS;

    return { tier: overrideTier, status, hasSubscription, ...entitlementsForTier(overrideTier) };
  }

  if (subscription.isNone()) return freeView(hasSubscription);

  const { tier: rawTier, status } = subscription.unwrap();
  const tier = isTier(rawTier) ? rawTier : "free";

  return { tier, status, hasSubscription, ...entitlementsForTier(tier) };
}
