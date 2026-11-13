import type { AppError, Option, Result } from "@packages/ddd-kit";

export type StripeEventStatus = "received" | "failed";

export type StripeEventRow = {
  id: string;
  type: string;
  receivedAt: Date;
  status: StripeEventStatus;
  lastError: Option<string>;
  replayedAt: Option<Date>;
};

export type StripeEventDelivery = {
  id: string;
  type: string;
  lastError: Option<string>;
};

export type StripeEventStoreError = AppError<"STRIPE_EVENT_PROVIDER_FAILURE">;

export interface IStripeEventStore {
  recordDelivery(delivery: StripeEventDelivery): Promise<Result<void, StripeEventStoreError>>;
  find(id: string): Promise<Result<Option<StripeEventRow>, StripeEventStoreError>>;
  list(limit: number): Promise<Result<StripeEventRow[], StripeEventStoreError>>;
  claimReplay(id: string, leaseSeconds: number): Promise<Result<boolean, StripeEventStoreError>>;
  releaseReplay(id: string): Promise<Result<void, StripeEventStoreError>>;
  markReplayed(id: string): Promise<Result<void, StripeEventStoreError>>;
}

export type StripeReplayRule = (type: string) => boolean;
