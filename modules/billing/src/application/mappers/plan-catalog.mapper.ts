import type { StripePriceLite } from "../ports/services/stripe-catalog.port";
import type { PlanCatalogItem } from "../queries/get-plan-catalog.query";
import { ENTITLEMENTS, isTier } from "../services/entitlement-policy.service";

export function freePlanOf(currency = "usd"): PlanCatalogItem {
  return {
    tier: "free",
    name: "Free",
    priceId: null,
    unitAmount: 0,
    currency,
    interval: null,
    marketingFeatures: [],
    rank: ENTITLEMENTS.free.rank,
    features: ENTITLEMENTS.free.features,
    maxMembers: ENTITLEMENTS.free.maxMembers,
  };
}

function paidPlansOf(price: StripePriceLite): PlanCatalogItem[] {
  const tier = price.tier;
  if (!isTier(tier) || tier === "free") return [];

  const entitlement = ENTITLEMENTS[tier];

  return [
    {
      tier,
      name: price.productName,
      priceId: price.priceId,
      unitAmount: price.unitAmount,
      currency: price.currency,
      interval: price.interval.toNull(),
      marketingFeatures: price.marketingFeatures,
      rank: entitlement.rank,
      features: entitlement.features,
      maxMembers: entitlement.maxMembers,
    },
  ];
}

export function planCatalogOf(prices: StripePriceLite[]): PlanCatalogItem[] {
  const paid = prices.flatMap(paidPlansOf);

  return [freePlanOf(paid[0]?.currency), ...paid].sort((a, b) => a.rank - b.rank);
}
