import type { Option, Result } from "@packages/ddd-kit";
import type { StripeSubscriptionState } from "../../../../shared/ports/stripe-event.port";
import type { BillingError } from "./subscription-read.port";

export type SubscriptionSyncState = StripeSubscriptionState;

export interface SubscriptionSyncKey {
  stripeSubscriptionId: string;
  localId: Option<string>;
}

export interface ISubscriptionSyncStore {
  findSyncState(
    key: SubscriptionSyncKey,
  ): Promise<Result<Option<SubscriptionSyncState>, BillingError>>;
  isKnownCustomer(stripeCustomerId: string): Promise<Result<boolean, BillingError>>;
}
