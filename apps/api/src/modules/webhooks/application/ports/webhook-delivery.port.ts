import type { ITransaction } from "../../../../shared/transaction";

export type WebhookDeliveryStatus = "pending" | "success" | "failed" | "dead_letter";

export type WebhookDeliveryRecord = {
  id: string;
  endpointId: string;
  outboxEventId: string;
  eventType: string;
  payload: unknown;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  lastResponseStatus: number | null;
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
  nextAttemptAt: Date | null;
  lastError: string | null;
  lastResponseStatus: number | null;
};

export interface IWebhookDeliveryRepository {
  list(
    args: ListDeliveriesArgs,
  ): Promise<{ items: WebhookDeliveryRecord[]; nextCursor: string | null }>;
  findById(id: string, organizationId: string): Promise<WebhookDeliveryRecord | null>;
  updateStatus(id: string, update: DeliveryUpdate, tx: ITransaction): Promise<void>;
  findPendingBatch(limit: number, tx: ITransaction): Promise<WebhookDeliveryRecord[]>;
  enqueueReplay(
    deliveryId: string,
    organizationId: string,
    tx?: ITransaction,
  ): Promise<WebhookDeliveryRecord | null>;
}
