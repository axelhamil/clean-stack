import { Option, Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  db,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type Transaction,
  webhooksSchema,
} from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type {
  DeliveryPage,
  DeliveryUpdate,
  IWebhookDeliveryRepository,
  ListDeliveriesArgs,
  WebhookDeliveryRecord,
} from "../../application/ports/webhook-delivery.port";
import type { WebhookRepoError } from "../../application/ports/webhook-endpoint.port";

const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;
const fail = createDbFailure("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");

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

export class DrizzleWebhookDeliveryRepository implements IWebhookDeliveryRepository {
  async list(args: ListDeliveriesArgs): Promise<Result<DeliveryPage, WebhookRepoError>> {
    try {
      const limit = Math.min(args.limit ?? 50, 200);
      const conds = [eq(wd.endpointId, args.endpointId)];
      if (args.status) conds.push(eq(wd.status, args.status));
      if (args.cursor) {
        const cursorDate = new Date(args.cursor);
        if (!Number.isNaN(cursorDate.getTime())) conds.push(lt(wd.createdAt, cursorDate));
      }
      const rows = await db
        .select({
          d: wd,
        })
        .from(wd)
        .innerJoin(we, eq(wd.endpointId, we.id))
        .where(and(eq(we.organizationId, args.organizationId), ...conds))
        .orderBy(desc(wd.createdAt))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => toRecord(r.d));
      const nextCursor = hasMore
        ? Option.fromNullable(items.at(-1)?.createdAt.toISOString())
        : Option.none<string>();
      return Result.ok({ items, nextCursor });
    } catch (e) {
      return fail(e, "webhook delivery list failed");
    }
  }

  async findById(id: string, organizationId: string): Promise<Option<WebhookDeliveryRecord>> {
    const [row] = await db
      .select({ d: wd })
      .from(wd)
      .innerJoin(we, eq(wd.endpointId, we.id))
      .where(and(eq(wd.id, id), eq(we.organizationId, organizationId)))
      .limit(1);
    return Option.fromNullable(row).map((r) => toRecord(r.d));
  }

  async updateStatus(
    id: string,
    update: DeliveryUpdate,
    tx: Transaction,
  ): Promise<Result<void, WebhookRepoError>> {
    try {
      await tx
        .update(wd)
        .set({
          status: update.status,
          attempts: update.attempts,
          nextAttemptAt: update.nextAttemptAt.toNull(),
          lastError: update.lastError.toNull(),
          lastResponseStatus: update.lastResponseStatus.toNull(),
        })
        .where(eq(wd.id, id));
      return Result.ok();
    } catch (e) {
      return fail(e, "webhook delivery updateStatus failed");
    }
  }

  async findPendingBatch(
    limit: number,
    tx: Transaction,
  ): Promise<Result<WebhookDeliveryRecord[], WebhookRepoError>> {
    try {
      const rows = await tx
        .select()
        .from(wd)
        .where(
          and(
            inArray(wd.status, ["pending", "failed"]),
            or(isNull(wd.nextAttemptAt), lte(wd.nextAttemptAt, sql`now()`)),
          ),
        )
        .orderBy(wd.createdAt)
        .limit(limit)
        .for("update", { skipLocked: true });
      return Result.ok(rows.map(toRecord));
    } catch (e) {
      return fail(e, "webhook delivery findPendingBatch failed");
    }
  }

  async enqueueReplay(
    deliveryId: string,
    organizationId: string,
    tx?: Transaction,
  ): Promise<Result<Option<WebhookDeliveryRecord>, WebhookRepoError>> {
    const exec = tx ?? db;
    try {
      const existingOpt = await this.findById(deliveryId, organizationId);
      if (existingOpt.isNone()) return Result.ok(Option.none());
      const existing = existingOpt.unwrap();
      const [row] = await exec
        .insert(wd)
        .values({
          id: uuidv7(),
          endpointId: existing.endpointId,
          outboxEventId: existing.outboxEventId,
          eventType: existing.eventType,
          payload: existing.payload,
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          idempotencyKey: `replay:${uuidv7()}`,
        })
        .returning();
      return Result.ok(Option.fromNullable(row).map(toRecord));
    } catch (e) {
      return fail(e, "webhook delivery enqueueReplay failed");
    }
  }
}
