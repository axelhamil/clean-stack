import type { Tier } from "../../shared/api/queries/billing-types";

// `EntitlementsView.tier` is the narrow `Tier` union — no guard needed to key
// into the catalog. `satisfies Record<Tier, string>` only proves every tier
// has AN entry, not that each one points at the RIGHT one, so
// `__tests__/billing-labels.test.ts` asserts the mapping directly.
export const TIER_KEYS = {
  free: "billing.tier.free",
  pro: "billing.tier.pro",
  business: "billing.tier.business",
} as const satisfies Record<Tier, string>;

// `EntitlementsView.status` widens to `string` on the wire — it carries
// Stripe's subscription status verbatim (`subscription-events.ts` on the
// server branches on the same set) plus the app's own "free" sentinel for an
// org with no subscription row. Guarded, never cast, before it keys into the
// catalog; an unrecognized value (a future Stripe status this app hasn't
// mapped yet) falls back to the raw code rather than crashing or silently
// mistranslating.
export type SubscriptionStatus =
  | "free"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "free",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export const STATUS_KEYS = {
  free: "billing.status.free",
  active: "billing.status.active",
  trialing: "billing.status.trialing",
  past_due: "billing.status.pastDue",
  canceled: "billing.status.canceled",
  unpaid: "billing.status.unpaid",
  incomplete: "billing.status.incomplete",
  incomplete_expired: "billing.status.incompleteExpired",
  paused: "billing.status.paused",
} as const satisfies Record<SubscriptionStatus, string>;
