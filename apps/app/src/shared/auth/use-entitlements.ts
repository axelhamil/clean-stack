import { useQuery } from "@tanstack/react-query";
import type { Tier } from "../api/queries/billing-types";
import { subscriptionQueryOptions } from "../api/queries/subscription";
import { useActiveOrgId } from "./use-active-org-id";

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, business: 2 };

export interface EntitlementsData {
  tier: Tier;
  status: string;
  rank: number;
  features: readonly string[];
  maxMembers: number | null;
  quotas: Record<string, number | null>;
}

const FREE_DATA: EntitlementsData = {
  tier: "free",
  status: "free",
  rank: 0,
  features: [],
  maxMembers: 3,
  quotas: {},
};

export function buildEntitlementsView(data: EntitlementsData | undefined) {
  const d = data ?? FREE_DATA;
  const max = d.maxMembers;
  return {
    tier: d.tier,
    status: d.status,
    rank: d.rank,
    features: d.features,
    maxMembers: max,
    hasFeature: (flag: string) => d.features.includes(flag),
    atLeast: (min: Tier) => d.rank >= TIER_RANK[min],
    seatsRemaining: (memberCount: number): number | null =>
      max === null ? null : Math.max(0, max - memberCount),
    canInviteMember: (memberCount: number) => max === null || memberCount < max,
    quotas: d.quotas,
    useQuota: (key: string, used: number) => {
      const limit = d.quotas[key] ?? null;
      const remaining = limit === null ? null : Math.max(0, limit - used);
      const exceeded = limit !== null && used >= limit;
      return { limit, used, remaining, exceeded };
    },
  };
}

export function useEntitlements() {
  const organizationId = useActiveOrgId();
  const { data } = useQuery(subscriptionQueryOptions(organizationId));
  return buildEntitlementsView(data);
}
