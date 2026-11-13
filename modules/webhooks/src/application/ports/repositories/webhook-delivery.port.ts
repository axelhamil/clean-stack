import type { Option, Result } from "@packages/ddd-kit";
import type { WebhookRepoError } from "./webhook-endpoint.port";

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "success", "failed", "dead_letter"] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export type WebhookDeliveryAttemptRecord = {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  requestHeaders: Option<Record<string, string>>;
  requestBody: Option<string>;
  responseStatus: Option<number>;
  responseHeaders: Option<Record<string, string>>;
  responseBody: Option<string>;
  durationMs: Option<number>;
  error: Option<string>;
  createdAt: Date;
};

export type WebhookDeliveryRecord = {
  id: string;
  endpointId: string;
  outboxEventId: string;
  eventType: string;
  payload: unknown;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Option<Date>;
  lastError: Option<string>;
  lastResponseStatus: Option<number>;
  idempotencyKey: string;
  createdAt: Date;
};

export type WebhookDeliveryWithAttempts = WebhookDeliveryRecord & {
  attemptHistory: WebhookDeliveryAttemptRecord[];
};

export type DeliveryLease = Pick<WebhookDeliveryRecord, "id" | "attempts">;

export type DeliveryClaimRequest = {
  limit: number;
  leaseSeconds: number;
};

export type DeliveryFailure = {
  lastError: string;
  lastResponseStatus: Option<number>;
  status: "failed" | "dead_letter";
  retryAfterSeconds: Option<number>;
};

export type NewAttempt = Omit<WebhookDeliveryAttemptRecord, "id" | "createdAt">;

export type TargetedDelivery = {
  endpointId: string;
  outboxEventId: string;
  eventType: string;
  payload: unknown;
  idempotencyKey: string;
};

export interface IWebhookDeliveryRepository {
  claim(request: DeliveryClaimRequest): Promise<Result<WebhookDeliveryRecord[], WebhookRepoError>>;
  markSuccess(
    lease: DeliveryLease,
    lastResponseStatus: Option<number>,
  ): Promise<Result<boolean, WebhookRepoError>>;
  markFailed(
    lease: DeliveryLease,
    failure: DeliveryFailure,
  ): Promise<Result<boolean, WebhookRepoError>>;
  release(lease: DeliveryLease): Promise<Result<boolean, WebhookRepoError>>;
  enqueueReplay(
    deliveryId: string,
    endpointId: string,
    organizationId: string,
  ): Promise<Result<Option<WebhookDeliveryRecord>, WebhookRepoError>>;
  createAttempt(attempt: NewAttempt): Promise<Result<void, WebhookRepoError>>;
  enqueueTargeted(
    delivery: TargetedDelivery,
  ): Promise<Result<WebhookDeliveryRecord, WebhookRepoError>>;
  enqueueFanout(deliveries: TargetedDelivery[]): Promise<Result<void, WebhookRepoError>>;
}
