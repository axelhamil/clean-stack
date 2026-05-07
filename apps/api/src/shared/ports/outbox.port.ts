import type { IDomainEvent } from "@packages/ddd-kit";
import type { OutboxEventMetadata } from "@packages/drizzle";
import type { ITransaction } from "../transaction";

export type OutboxEnqueueScope = {
  source: string;
  organizationId?: string | null;
  aggregateType?: string;
  traceparent?: string;
};

export type OutboxRecord = {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  organizationId: string | null;
  payload: unknown;
  metadata: OutboxEventMetadata;
  occurredAt: Date;
  attempts: number;
};

export interface IOutboxRepository {
  enqueue(events: IDomainEvent[], scope: OutboxEnqueueScope, tx?: ITransaction): Promise<void>;
  findPendingBatch(limit: number, tx: ITransaction): Promise<OutboxRecord[]>;
  markDispatched(id: string, tx: ITransaction): Promise<void>;
  markFailed(
    id: string,
    error: string,
    nextAttemptAt: Date | null,
    tx: ITransaction,
  ): Promise<void>;
}
