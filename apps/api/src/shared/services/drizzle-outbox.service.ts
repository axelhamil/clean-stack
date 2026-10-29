import { domainEventToOutboxRow, type IDomainEvent, Option, Result } from "@packages/ddd-kit";
import {
  and,
  db,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  outboxSchema,
  type PgUpdateSetSource,
  resolveExecutor,
  sql,
} from "@packages/drizzle";
import { PayloadByEventType } from "@packages/events";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type {
  IOutboxRepository,
  OutboxClaimRequest,
  OutboxDeliveries,
  OutboxEnqueueScope,
  OutboxFailure,
  OutboxLease,
  OutboxPendingState,
  OutboxRecord,
} from "../ports/outbox.port";
import { getRequestId } from "../request-context";

export const OUTBOX_CHANNEL = "outbox_event";

const oe = outboxSchema.outboxEvent;
const dbAttrs = { "db.system.name": "postgresql" } as const;

type PayloadSchema = {
  safeParse: (v: unknown) => { success: true } | { success: false; error: { message: string } };
};

const PAYLOAD_SCHEMAS: Readonly<Record<string, PayloadSchema | undefined>> = PayloadByEventType;

function assertPayloadValid(event: IDomainEvent): void {
  const schema = PAYLOAD_SCHEMAS[event.eventType];
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

function unavailable(error: unknown): string {
  return `outbox_unavailable: ${error instanceof Error ? error.message : String(error)}`;
}

function byOccurrence(a: OutboxRecord, b: OutboxRecord): number {
  return a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id);
}

function nonNegative(ms: Option<number>): Option<number> {
  return ms.map((value) => Math.max(0, value));
}

const now = sql`now()`;
const secondsFromNow = (seconds: number) => sql`now() + make_interval(secs => ${seconds})`;
const merged = (deliveries: OutboxDeliveries) =>
  sql`${oe.deliveries} || ${JSON.stringify(deliveries)}::jsonb`;
const liveRow = and(isNull(oe.dispatchedAt), isNull(oe.deadAt));
const deadRow = and(isNull(oe.dispatchedAt), isNotNull(oe.deadAt));
const leased = ({ id, attempts }: OutboxLease) =>
  and(eq(oe.id, id), eq(oe.attempts, attempts), isNull(oe.dispatchedAt));
const DEAD_SHARE_OF_CLAIM = 4;

function claimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  { limit, eventTypes, leaseSeconds }: OutboxClaimRequest,
) {
  const types = [...eventTypes];
  const claimable = { id: oe.id, deadAt: oe.deadAt, occurredAt: oe.occurredAt };
  const live = db.$with("live").as(
    db
      .select(claimable)
      .from(oe)
      .where(
        and(
          liveRow,
          inArray(oe.eventType, types),
          or(isNull(oe.nextAttemptAt), lte(oe.nextAttemptAt, now)),
        ),
      )
      .orderBy(oe.occurredAt, oe.id)
      .limit(limit)
      .for("update", { skipLocked: true }),
  );
  const dead = db.$with("dead").as(
    db
      .select(claimable)
      .from(oe)
      .where(and(deadRow, inArray(oe.eventType, types), lte(oe.nextAttemptAt, now)))
      .orderBy(oe.nextAttemptAt)
      .limit(Math.ceil(limit / DEAD_SHARE_OF_CLAIM))
      .for("update", { skipLocked: true }),
  );
  const due = db
    .$with("due")
    .as(
      db
        .select()
        .from(live)
        .unionAll(db.select().from(dead))
        .orderBy(live.occurredAt, live.id)
        .limit(limit),
    );

  return exec
    .with(live, dead, due)
    .update(oe)
    .set({
      attempts: sql`${oe.attempts} + 1`,
      nextAttemptAt: secondsFromNow(leaseSeconds),
    })
    .from(due)
    .where(eq(oe.id, due.id))
    .returning({
      id: oe.id,
      eventType: oe.eventType,
      aggregateId: oe.aggregateId,
      aggregateType: oe.aggregateType,
      organizationId: oe.organizationId,
      payload: oe.payload,
      metadata: oe.metadata,
      occurredAt: oe.occurredAt,
      attempts: oe.attempts,
      deadAt: due.deadAt,
      deliveries: oe.deliveries,
    });
}

export class DrizzleOutboxRepository implements IOutboxRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async enqueue(events: IDomainEvent[], scope: OutboxEnqueueScope): Promise<void> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > enqueue" },
      async () => {
        if (events.length === 0) return;

        try {
          for (const event of events) assertPayloadValid(event);

          const requestId = getRequestId();
          const rows = events.map((event) =>
            domainEventToOutboxRow(event, {
              source: scope.source,
              organizationId: scope.organizationId,
              aggregateType: scope.aggregateType ?? "unknown",
              traceparent: scope.traceparent,
              requestId,
            }),
          );
          await exec.insert(oe).values(rows).onConflictDoNothing({ target: oe.id });
          await exec.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, '')`);
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }

  async claim(request: OutboxClaimRequest): Promise<Result<OutboxRecord[], string>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleOutboxRepository > claim" }, async () => {
      if (request.eventTypes.length === 0) return Result.ok([]);

      try {
        const query = claimQuery(exec, request);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(
          rows
            .map((row) => ({
              ...row,
              organizationId: Option.fromNullable(row.organizationId),
              deadAt: Option.fromNullable(row.deadAt),
            }))
            .sort(byOccurrence),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(unavailable(err));
      }
    });
  }

  async pendingState(eventTypes: readonly string[]): Promise<Result<OutboxPendingState, string>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > pendingState" },
      async () => {
        if (eventTypes.length === 0) {
          return Result.ok({ dueInMs: Option.none<number>(), oldestPendingSeconds: 0 });
        }

        try {
          const query = exec
            .select({
              liveDueMs: sql<
                string | null
              >`extract(epoch from (min(coalesce(${oe.nextAttemptAt}, clock_timestamp())) filter (where ${oe.deadAt} is null) - clock_timestamp())) * 1000`,
              deadDueMs: sql<
                string | null
              >`extract(epoch from (min(${oe.nextAttemptAt}) filter (where ${oe.deadAt} is not null) - clock_timestamp())) * 1000`,
              oldestPendingSeconds: sql<string>`coalesce(extract(epoch from (clock_timestamp() - min(${oe.occurredAt}) filter (where ${oe.deadAt} is null))), 0)`,
            })
            .from(oe)
            .where(and(or(liveRow, deadRow), inArray(oe.eventType, [...eventTypes])));
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const live = nonNegative(Option.fromNullable(row?.liveDueMs).map(Number));
          const dead = nonNegative(Option.fromNullable(row?.deadDueMs).map(Number));

          return Result.ok({
            dueInMs: live.map((ms) => Math.min(ms, dead.unwrapOr(ms))).or(dead),
            oldestPendingSeconds: Math.max(0, Number(row?.oldestPendingSeconds ?? 0)),
          });
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(unavailable(err));
        }
      },
    );
  }

  async retireNotifyTrigger(): Promise<Result<void, string>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleOutboxRepository > retireNotifyTrigger" },
      async () => {
        try {
          await db.execute(sql`drop trigger if exists outbox_notify_trigger on ${oe}`);
          await db.execute(sql`drop function if exists outbox_notify()`);

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(unavailable(err));
        }
      },
    );
  }

  async markDelivered(
    lease: OutboxLease,
    deliveries: OutboxDeliveries,
  ): Promise<Result<boolean, string>> {
    return this.settle("markDelivered", lease, {
      dispatchedAt: now,
      nextAttemptAt: null,
      deadAt: null,
      deliveries: merged(deliveries),
    });
  }

  async markFailed(lease: OutboxLease, failure: OutboxFailure): Promise<Result<boolean, string>> {
    return this.settle("markFailed", lease, {
      lastError: failure.lastError,
      nextAttemptAt: secondsFromNow(failure.retryAfterSeconds),
      deliveries: merged(failure.deliveries),
      ...(failure.dead ? { deadAt: sql`coalesce(${oe.deadAt}, now())` } : {}),
    });
  }

  async release(lease: OutboxLease): Promise<Result<boolean, string>> {
    return this.settle("release", lease, {
      attempts: sql`${oe.attempts} - 1`,
      nextAttemptAt: now,
    });
  }

  private async settle(
    method: "markDelivered" | "markFailed" | "release",
    lease: OutboxLease,
    changes: PgUpdateSetSource<typeof oe>,
  ): Promise<Result<boolean, string>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: `DrizzleOutboxRepository > ${method}` },
      async () => {
        try {
          const query = exec.update(oe).set(changes).where(leased(lease)).returning({ id: oe.id });
          const written = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(written.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(unavailable(err));
        }
      },
    );
  }
}
