import type { AppError, Result } from "@packages/ddd-kit";

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
