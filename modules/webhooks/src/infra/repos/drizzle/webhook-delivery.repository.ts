import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
  uuidv7,
} from "@packages/ddd-kit";
import {
  and,
  claimedSet,
  db,
  dbNow,
  deadShareOf,
  eq,
  getTableColumns,
  inArray,
  isDeadDue,
  isDue,
  isNotNull,
  leasedBy,
  type PgUpdateSetSource,
  releasedSet,
  resolveExecutor,
  secondsFromNow,
} from "@packages/drizzle";
import * as webhooksSchema from "../../../../schemas/webhooks";
import type {
  DeliveryClaimRequest,
  DeliveryFailure,
  DeliveryLease,
  IWebhookDeliveryRepository,
  NewAttempt,
  TargetedDelivery,
  WebhookDeliveryRecord,
} from "../../../application/ports/repositories/webhook-delivery.port";
import type { WebhookRepoError } from "../../../application/ports/repositories/webhook-endpoint.port";
import { toDeliveryRecord } from "./webhook.mapper";

const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;
const wda = webhooksSchema.webhookDeliveryAttempt;
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

export class DrizzleWebhookDeliveryRepository implements IWebhookDeliveryRepository {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", logger);
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
              .map(toDeliveryRecord)
              .sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
              ),
          );
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook delivery claim failed");
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
          return this.fail(e, `webhook delivery ${method} failed`);
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
          const [existingRow] = await findQuery.execute();
          if (!existingRow) return Result.ok(Option.none());
          const existing = toDeliveryRecord(existingRow.d);
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
          const [row] = await query.execute();
          return Result.ok(Option.fromNullable(row).map(toDeliveryRecord));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook delivery enqueueReplay failed");
        }
      },
    );
  }

  async createAttempt(args: NewAttempt): Promise<Result<void, WebhookRepoError>> {
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
          return this.fail(e, "webhook delivery createAttempt failed");
        }
      },
    );
  }

  async enqueueTargeted(
    args: TargetedDelivery,
  ): Promise<Result<WebhookDeliveryRecord, WebhookRepoError>> {
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
          return Result.ok(toDeliveryRecord(row));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook delivery enqueueTargeted failed");
        }
      },
    );
  }

  async enqueueFanout(deliveries: TargetedDelivery[]): Promise<Result<void, WebhookRepoError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleWebhookDeliveryRepository > enqueueFanout" },
      async () => {
        try {
          const query = exec
            .insert(wd)
            .values(
              deliveries.map((delivery) => ({
                id: uuidv7(),
                endpointId: delivery.endpointId,
                outboxEventId: delivery.outboxEventId,
                eventType: delivery.eventType,
                payload: delivery.payload,
                status: "pending" as const,
                attempts: 0,
                nextAttemptAt: dbNow,
                idempotencyKey: delivery.idempotencyKey,
              })),
            )
            .onConflictDoNothing({ target: wd.idempotencyKey });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "webhook delivery enqueueFanout failed");
        }
      },
    );
  }
}
