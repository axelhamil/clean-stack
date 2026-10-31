export const PLAN_TIERS = ["free", "pro", "business"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

const PLAN_LABEL_KEYS = {
  free: "orgs.plan.free",
  pro: "orgs.plan.pro",
  business: "orgs.plan.business",
} as const satisfies Record<PlanTier, string>;

export function planLabelKey(plan: string) {
  const tier = PLAN_TIERS.find((candidate) => candidate === plan);

  return tier ? PLAN_LABEL_KEYS[tier] : null;
}
