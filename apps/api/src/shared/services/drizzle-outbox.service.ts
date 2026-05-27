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
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository, OutboxEnqueueScope, OutboxRecord } from "../ports/outbox.port";

const oe = outboxSchema.outboxEvent;
const dbAttrs = { "db.system.name": "postgresql" } as const;

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
  constructor(private readonly instrumentation: IInstrumentation) {}

  async enqueue(
    events: IDomainEvent[],
    scope: OutboxEnqueueScope,
    tx?: Transaction,
  ): Promise<void> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > enqueue" },
      async () => {
        try {
          if (events.length === 0) return;
          for (const event of events) assertPayloadValid(event);
          const rows = events.map((event) =>
            domainEventToOutboxRow(event, {
              source: scope.source,
              organizationId: scope.organizationId,
              aggregateType: scope.aggregateType ?? "unknown",
              traceparent: scope.traceparent,
            }),
          );
          const query = exec.insert(oe).values(rows);
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }

  async findPendingBatch(limit: number, tx: Transaction): Promise<OutboxRecord[]> {
    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > findPendingBatch" },
      async () => {
        try {
          const query = tx
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
          return await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }

  async markDispatched(id: string, tx: Transaction): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > markDispatched" },
      async () => {
        try {
          const query = tx.update(oe).set({ dispatchedAt: sql`now()` }).where(eq(oe.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }

  async markFailed(
    id: string,
    error: string,
    nextAttemptAt: Date | null,
    tx: Transaction,
  ): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > markFailed" },
      async () => {
        try {
          const query = tx
            .update(oe)
            .set({
              attempts: sql`${oe.attempts} + 1`,
              lastError: error,
              nextAttemptAt,
            })
            .where(eq(oe.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
