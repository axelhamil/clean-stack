import { domainEventToOutboxRow, type IDomainEvent } from "@packages/ddd-kit";
import {
  and,
  db,
  eq,
  isNull,
  lte,
  or,
  outboxSchema,
  sql,
  type Transaction,
} from "@packages/drizzle";
import { PayloadByEventType } from "@packages/events";
import type { IOutboxRepository, OutboxEnqueueScope, OutboxRecord } from "../ports/outbox.port";

const oe = outboxSchema.outboxEvent;

function assertPayloadValid(event: IDomainEvent): void {
  const schema = (
    PayloadByEventType as Record<
      string,
      {
        safeParse: (
          v: unknown,
        ) => { success: true } | { success: false; error: { message: string } };
      }
    >
  )[event.eventType];
  if (!schema) {
    throw new Error(`outbox: unknown event type "${event.eventType}" (not in PayloadByEventType)`);
  }
  const parsed = schema.safeParse(event.payload);
  if (!parsed.success) {
    throw new Error(
      `outbox: payload validation failed for "${event.eventType}": ${parsed.error.message}`,
    );
  }
}

export class DrizzleOutboxRepository implements IOutboxRepository {
  async enqueue(
    events: IDomainEvent[],
    scope: OutboxEnqueueScope,
    tx?: Transaction,
  ): Promise<void> {
    if (events.length === 0) return;
    for (const event of events) assertPayloadValid(event);
    const exec = tx ?? db;
    const rows = events.map((event) =>
      domainEventToOutboxRow(event, {
        source: scope.source,
        organizationId: scope.organizationId,
        aggregateType: scope.aggregateType ?? "unknown",
        traceparent: scope.traceparent,
      }),
    );
    await exec.insert(oe).values(rows);
  }

  async findPendingBatch(limit: number, tx: Transaction): Promise<OutboxRecord[]> {
    const rows = await tx
      .select({
        id: oe.id,
        eventType: oe.eventType,
        aggregateId: oe.aggregateId,
        aggregateType: oe.aggregateType,
        organizationId: oe.organizationId,
        payload: oe.payload,
        metadata: oe.metadata,
        occurredAt: oe.occurredAt,
        attempts: oe.attempts,
      })
      .from(oe)
      .where(
        and(
          isNull(oe.dispatchedAt),
          or(isNull(oe.nextAttemptAt), lte(oe.nextAttemptAt, sql`now()`)),
        ),
      )
      .orderBy(oe.occurredAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    return rows;
  }

  async markDispatched(id: string, tx: Transaction): Promise<void> {
    await tx.update(oe).set({ dispatchedAt: sql`now()` }).where(eq(oe.id, id));
  }

  async markFailed(
    id: string,
    error: string,
    nextAttemptAt: Date | null,
    tx: Transaction,
  ): Promise<void> {
    await tx
      .update(oe)
      .set({
        attempts: sql`${oe.attempts} + 1`,
        lastError: error,
        nextAttemptAt,
      })
      .where(eq(oe.id, id));
  }
}
