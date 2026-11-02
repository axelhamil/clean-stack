import { Option, Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  asc,
  claimedSet,
  db,
  dbNow,
  deadShareOf,
  desc,
  eq,
  getTableColumns,
  inArray,
  isDeadDue,
  isDue,
  isNotNull,
  leasedBy,
  lt,
  type PgUpdateSetSource,
  releasedSet,
  resolveExecutor,
  secondsFromNow,
  webhooksSchema,
} from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  DeliveryClaimRequest,
  DeliveryFailure,
  DeliveryLease,
  DeliveryPage,
  IWebhookDeliveryRepository,
  ListDeliveriesArgs,
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../../application/ports/webhook-delivery.port";
import type { WebhookRepoError } from "../../application/ports/webhook-endpoint.port";

const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;
const wda = webhooksSchema.webhookDeliveryAttempt;
const fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;
const unsettled = and(
  inArray(wd.status, ["pending", "failed", "dead_letter"]),
  isNotNull(wd.nextAttemptAt),
);

function claimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  { limit, leaseSeconds }: DeliveryClaimRequest,
) {
  const claimable = { id: wd.id, createdAt: wd.createdAt };
  const live = db.$with("live").as(
    db
      .select(claimable)
      .from(wd)
      .where(and(inArray(wd.status, ["pending", "failed"]), isDue(wd.nextAttemptAt)))
      .orderBy(wd.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true }),
  );
  const dead = db.$with("dead").as(
    db
      .select(claimable)
      .from(wd)
      .where(and(eq(wd.status, "dead_letter"), isDeadDue(wd.nextAttemptAt)))
      .orderBy(wd.nextAttemptAt)
      .limit(deadShareOf(limit))
      .for("update", { skipLocked: true }),
  );
  const due = db
    .$with("due")
    .as(
      db.select().from(live).unionAll(db.select().from(dead)).orderBy(live.createdAt).limit(limit),
    );

  return exec
    .with(live, dead, due)
    .update(wd)
    .set(claimedSet(wd, leaseSeconds))
    .from(due)
    .where(eq(wd.id, due.id))
    .returning(getTableColumns(wd));
}

function toRecord(row: typeof wd.$inferSelect): WebhookDeliveryRecord {
  return {
    id: row.id,
    endpointId: row.endpointId,
    outboxEventId: row.outboxEventId,
    eventType: row.eventType,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: Option.fromNullable(row.nextAttemptAt),
    lastError: Option.fromNullable(row.lastError),
    lastResponseStatus: Option.fromNullable(row.lastResponseStatus),
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}

function toAttemptRecord(row: typeof wda.$inferSelect): WebhookDeliveryAttemptRecord {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    attemptNumber: row.attemptNumber,
    requestHeaders: Option.fromNullable(row.requestHeaders),
    requestBody: Option.fromNullable(row.requestBody),
    responseStatus: Option.fromNullable(row.responseStatus),
    responseHeaders: Option.fromNullable(row.responseHeaders),
    responseBody: Option.fromNullable(row.responseBody),
    durationMs: Option.fromNullable(row.durationMs),
    error: Option.fromNullable(row.error),
    createdAt: row.createdAt,
  };
}

export class DrizzleWebhookDeliveryRepository implements IWebhookDeliveryRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async list(args: ListDeliveriesArgs): Promise<Result<DeliveryPage, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > list" },
      async () => {
        try {
          const limit = Math.min(args.limit ?? 50, 200);
          const conds = [eq(wd.endpointId, args.endpointId)];
          if (args.status) conds.push(eq(wd.status, args.status));
          if (args.cursor) {
            const cursorDate = new Date(args.cursor);
            if (!Number.isNaN(cursorDate.getTime())) conds.push(lt(wd.createdAt, cursorDate));
          }
          const query = exec
            .select({ d: wd })
            .from(wd)
            .innerJoin(we, eq(wd.endpointId, we.id))
            .where(and(eq(we.organizationId, args.organizationId), ...conds))
            .orderBy(desc(wd.createdAt))
            .limit(limit + 1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const hasMore = rows.length > limit;
          const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => toRecord(r.d));
          const nextCursor = hasMore
            ? Option.fromNullable(items.at(-1)?.createdAt.toISOString())
            : Option.none<string>();
          return Result.ok({ items, nextCursor });
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook delivery list failed");
        }
      },
    );
  }

  async findById(id: string, organizationId: string): Promise<Option<WebhookDeliveryRecord>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > findById" },
      async () => {
        try {
          const query = exec
            .select({ d: wd })
            .from(wd)
            .innerJoin(we, eq(wd.endpointId, we.id))
            .where(and(eq(wd.id, id), eq(we.organizationId, organizationId)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Option.fromNullable(row).map((r) => toRecord(r.d));
        } catch (e) {
          this.instrumentation.capture(e);
          throw e;
        }
      },
    );
  }

  async claim(
    request: DeliveryClaimRequest,
  ): Promise<Result<WebhookDeliveryRecord[], WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > claim" },
      async () => {
        try {
          const query = claimQuery(exec, request);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            rows
              .map(toRecord)
              .sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
              ),
          );
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook delivery claim failed");
        }
      },
    );
  }

  async markSuccess(
    lease: DeliveryLease,
    lastResponseStatus: Option<number>,
  ): Promise<Result<boolean, WebhookRepoError>> {
    return this.settle("markSuccess", lease, {
      status: "success",
      nextAttemptAt: null,
      lastError: null,
      lastResponseStatus: lastResponseStatus.toNull(),
    });
  }

  async markFailed(
    lease: DeliveryLease,
    failure: DeliveryFailure,
  ): Promise<Result<boolean, WebhookRepoError>> {
    return this.settle("markFailed", lease, {
      status: failure.status,
      nextAttemptAt: failure.retryAfterSeconds.map(secondsFromNow).toNull(),
      lastError: failure.lastError,
      lastResponseStatus: failure.lastResponseStatus.toNull(),
    });
  }

  async release(lease: DeliveryLease): Promise<Result<boolean, WebhookRepoError>> {
    return this.settle("release", lease, releasedSet(wd));
  }

  private async settle(
    method: "markSuccess" | "markFailed" | "release",
    lease: DeliveryLease,
    changes: PgUpdateSetSource<typeof wd>,
  ): Promise<Result<boolean, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleWebhookDeliveryRepository > ${method}` },
      async () => {
        try {
          const query = exec
            .update(wd)
            .set(changes)
            .where(and(leasedBy(wd, lease), unsettled))
            .returning({ id: wd.id });
          const written = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(written.length > 0);
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, `webhook delivery ${method} failed`);
        }
      },
    );
  }

  async enqueueReplay(
    deliveryId: string,
    endpointId: string,
    organizationId: string,
  ): Promise<Result<Option<WebhookDeliveryRecord>, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > enqueueReplay" },
      async () => {
        try {
          const findQuery = exec
            .select({ d: wd })
            .from(wd)
            .innerJoin(we, eq(wd.endpointId, we.id))
            .where(
              and(
                eq(wd.id, deliveryId),
                eq(wd.endpointId, endpointId),
                eq(we.organizationId, organizationId),
              ),
            )
            .limit(1);
          const [existingRow] = await this.instrumentation.startSpan(
            { name: findQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => findQuery.execute(),
          );
          if (!existingRow) return Result.ok(Option.none());
          const existing = toRecord(existingRow.d);
          const query = exec
            .insert(wd)
            .values({
              id: uuidv7(),
              endpointId: existing.endpointId,
              outboxEventId: existing.outboxEventId,
              eventType: existing.eventType,
              payload: existing.payload,
              status: "pending",
              attempts: 0,
              nextAttemptAt: dbNow,
              idempotencyKey: `replay:${uuidv7()}`,
            })
            .returning();
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(row).map(toRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook delivery enqueueReplay failed");
        }
      },
    );
  }

  async createAttempt(
    args: Omit<WebhookDeliveryAttemptRecord, "id" | "createdAt">,
  ): Promise<Result<void, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > createAttempt" },
      async () => {
        try {
          const query = exec.insert(wda).values({
            id: uuidv7(),
            deliveryId: args.deliveryId,
            attemptNumber: args.attemptNumber,
            requestHeaders: args.requestHeaders.toNull(),
            requestBody: args.requestBody.toNull(),
            responseStatus: args.responseStatus.toNull(),
            responseHeaders: args.responseHeaders.toNull(),
            responseBody: args.responseBody.toNull(),
            durationMs: args.durationMs.toNull(),
            error: args.error.toNull(),
          });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook delivery createAttempt failed");
        }
      },
    );
  }

  async findByIdWithAttempts(
    id: string,
    organizationId: string,
  ): Promise<Option<WebhookDeliveryRecord & { attemptHistory: WebhookDeliveryAttemptRecord[] }>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > findByIdWithAttempts" },
      async () => {
        try {
          const deliveryQuery = exec
            .select({ d: wd })
            .from(wd)
            .innerJoin(we, eq(wd.endpointId, we.id))
            .where(and(eq(wd.id, id), eq(we.organizationId, organizationId)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: deliveryQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => deliveryQuery.execute(),
          );
          if (!row) return Option.none();
          const attemptsQuery = exec
            .select()
            .from(wda)
            .where(eq(wda.deliveryId, id))
            .orderBy(asc(wda.attemptNumber));
          const attemptRows = await this.instrumentation.startSpan(
            { name: attemptsQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => attemptsQuery.execute(),
          );
          return Option.some({
            ...toRecord(row.d),
            attemptHistory: attemptRows.map(toAttemptRecord),
          });
        } catch (e) {
          this.instrumentation.capture(e);
          throw e;
        }
      },
    );
  }

  async enqueueTargeted(args: {
    endpointId: string;
    outboxEventId: string;
    eventType: string;
    payload: unknown;
    idempotencyKey: string;
  }): Promise<Result<WebhookDeliveryRecord, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > enqueueTargeted" },
      async () => {
        try {
          const query = exec
            .insert(wd)
            .values({
              id: uuidv7(),
              endpointId: args.endpointId,
              outboxEventId: args.outboxEventId,
              eventType: args.eventType,
              payload: args.payload,
              status: "pending",
              attempts: 0,
              idempotencyKey: args.idempotencyKey,
            })
            .returning();
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) throw new Error("enqueueTargeted returned no row");
          return Result.ok(toRecord(row));
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "webhook delivery enqueueTargeted failed");
        }
      },
    );
  }
}
