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

export type StripeEventCopy = { payload: string };

export type StripeWebhookHandler = (request: Request) => Promise<Response>;

export type StripeGatewayError = AppError<"STRIPE_PROVIDER_FAILURE">;

export type StripeEventRetrieveError =
  | StripeGatewayError
  | AppError<"STRIPE_EVENT_EXPIRED_NOT_FOUND">;

export interface IStripeEventGateway {
  isConfigured(): boolean;
  retrieve(id: string): Promise<Result<StripeEventCopy, StripeEventRetrieveError>>;
  redeliver(
    copy: StripeEventCopy,
    handler: StripeWebhookHandler,
  ): Promise<Result<void, StripeGatewayError>>;
}

export type StripeReplayRule = (type: string) => boolean;
