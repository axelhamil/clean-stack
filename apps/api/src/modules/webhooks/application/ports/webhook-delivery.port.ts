import type { Option, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../../../../shared/transaction";
import type { WebhookRepoError } from "./webhook-endpoint.port";

export type WebhookDeliveryStatus = "pending" | "success" | "failed" | "dead_letter";

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

export type ListDeliveriesArgs = {
  endpointId: string;
  organizationId: string;
  status?: WebhookDeliveryStatus;
  limit?: number;
  cursor?: string;
};

export type DeliveryUpdate = {
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Option<Date>;
  lastError: Option<string>;
  lastResponseStatus: Option<number>;
};

export type DeliveryPage = {
  items: WebhookDeliveryRecord[];
  nextCursor: Option<string>;
};

export interface IWebhookDeliveryRepository {
  list(args: ListDeliveriesArgs): Promise<Result<DeliveryPage, WebhookRepoError>>;
  findById(id: string, organizationId: string): Promise<Option<WebhookDeliveryRecord>>;
  updateStatus(
    id: string,
    update: DeliveryUpdate,
    tx: ITransaction,
  ): Promise<Result<void, WebhookRepoError>>;
  findPendingBatch(
    limit: number,
    tx: ITransaction,
  ): Promise<Result<WebhookDeliveryRecord[], WebhookRepoError>>;
  enqueueReplay(
    deliveryId: string,
    endpointId: string,
    organizationId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<WebhookDeliveryRecord>, WebhookRepoError>>;
  createAttempt(
    args: Omit<WebhookDeliveryAttemptRecord, "id" | "createdAt">,
    tx: ITransaction,
  ): Promise<Result<void, WebhookRepoError>>;
  findByIdWithAttempts(
    id: string,
    organizationId: string,
  ): Promise<Option<WebhookDeliveryRecord & { attemptHistory: WebhookDeliveryAttemptRecord[] }>>;
  enqueueTargeted(
    args: {
      endpointId: string;
      outboxEventId: string;
      eventType: string;
      payload: unknown;
      idempotencyKey: string;
    },
    tx: ITransaction,
  ): Promise<Result<WebhookDeliveryRecord, WebhookRepoError>>;
}
