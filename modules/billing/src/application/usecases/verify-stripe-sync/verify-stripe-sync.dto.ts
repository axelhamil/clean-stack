import type { Option } from "@packages/ddd-kit";
import type { SubscriptionSyncKey } from "../../ports/repositories/subscription-sync.port";
import type { StripeSubscriptionState } from "../../ports/services/stripe-event-gateway.port";

export interface StripeSubscriptionPlan {
  stripeSubscriptionId: string;
  customerId: string;
  priceIds: string[];
}

export type VerifyStripeSyncInput =
  | { kind: "checkout-completed"; stripeSubscriptionId: string }
  | { kind: "subscription-created"; key: SubscriptionSyncKey; plan: StripeSubscriptionPlan }
  | { kind: "subscription-updated"; key: SubscriptionSyncKey; state: StripeSubscriptionState }
  | { kind: "subscription-deleted"; plan: StripeSubscriptionPlan };

export type VerifyStripeSyncOutput = Option<string>;
