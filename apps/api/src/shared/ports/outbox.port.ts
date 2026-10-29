import type { IDomainEvent, Option, Result } from "@packages/ddd-kit";
import type { OutboxEventMetadata } from "@packages/drizzle";

export type OutboxDeliveries = Readonly<Record<string, string>>;

export interface DeliveredEvent extends IDomainEvent {
  readonly eventId: string;
  readonly aggregateType: string;
  readonly organizationId?: string;
  readonly requestId?: string;
}

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
  organizationId: Option<string>;
  payload: unknown;
  metadata: OutboxEventMetadata;
  occurredAt: Date;
  attempts: number;
  deadAt: Option<Date>;
  deliveries: OutboxDeliveries;
};

export type OutboxLease = Pick<OutboxRecord, "id" | "attempts">;

export type OutboxClaimRequest = {
  limit: number;
  eventTypes: readonly string[];
  leaseSeconds: number;
};

export type OutboxPendingState = {
  dueInMs: Option<number>;
  oldestPendingSeconds: number;
};

export type OutboxFailure = {
  lastError: string;
  retryAfterSeconds: number;
  dead: boolean;
  deliveries: OutboxDeliveries;
};

export interface IOutboxRepository {
  enqueue(events: IDomainEvent[], scope: OutboxEnqueueScope): Promise<void>;
  claim(request: OutboxClaimRequest): Promise<Result<OutboxRecord[], string>>;
  pendingState(eventTypes: readonly string[]): Promise<Result<OutboxPendingState, string>>;
  markDelivered(lease: OutboxLease, deliveries: OutboxDeliveries): Promise<Result<boolean, string>>;
  markFailed(lease: OutboxLease, failure: OutboxFailure): Promise<Result<boolean, string>>;
  release(lease: OutboxLease): Promise<Result<boolean, string>>;
  retireNotifyTrigger(): Promise<Result<void, string>>;
}
