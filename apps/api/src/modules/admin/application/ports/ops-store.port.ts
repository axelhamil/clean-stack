import type { AppError, Option, Result } from "@packages/ddd-kit";

export type OpsStoreError = AppError<"ADMIN_OPS_PROVIDER_FAILURE">;

export type DeadOutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  deadAt: Date;
  attempts: number;
  lastError: Option<string>;
  nextAttemptAt: Option<Date>;
};

export type DeadOutboxPage = { items: DeadOutboxEvent[]; total: number };

export type DeadQueueCounts = { emails: number; webhooks: number };

export interface IOpsStore {
  listDeadOutbox(limit: number): Promise<Result<DeadOutboxPage, OpsStoreError>>;
  countDeadQueues(): Promise<Result<DeadQueueCounts, OpsStoreError>>;
  requeueDead(ids: string[], leaseSeconds: number): Promise<Result<string[], OpsStoreError>>;
}
