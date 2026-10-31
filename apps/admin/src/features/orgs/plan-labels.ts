import { TIERS, type Tier } from "@packages/access-control";

const PLAN_LABEL_KEYS = {
  free: "orgs.plan.free",
  pro: "orgs.plan.pro",
  business: "orgs.plan.business",
} as const satisfies Record<Tier, string>;

export function planLabelKey(plan: string) {
  const tier = TIERS.find((candidate) => candidate === plan);

  return tier ? PLAN_LABEL_KEYS[tier] : null;
}
