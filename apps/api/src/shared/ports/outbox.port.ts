import type { IDomainEvent, Option } from "@packages/ddd-kit";
import type { OutboxEventMetadata, Transaction } from "@packages/drizzle";

export type OutboxEnqueueScope = {
  source: string;
  organizationId?: string | null;
  aggregateType?: string;
  traceparent?: string;
  id?: string;
};

export type OutboxRecord = {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  organizationId: Option<string>;
  payload: unknown;
  metadata: OutboxEventMetadata;
  occurredAt: Date;
  attempts: number;
};

export interface IOutboxRepository {
  enqueue(events: IDomainEvent[], scope: OutboxEnqueueScope, tx?: Transaction): Promise<void>;
  findPendingBatch(limit: number, tx: Transaction): Promise<OutboxRecord[]>;
  markDispatched(id: string, tx: Transaction): Promise<void>;
  markFailed(
    id: string,
    error: string,
    nextAttemptAt: Option<Date>,
    tx: Transaction,
  ): Promise<void>;
}
