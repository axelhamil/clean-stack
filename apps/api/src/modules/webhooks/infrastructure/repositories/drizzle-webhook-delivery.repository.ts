import { uuidv7 } from "@packages/ddd-kit";
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
import type {
  DeliveryUpdate,
  IWebhookDeliveryRepository,
  ListDeliveriesArgs,
  WebhookDeliveryRecord,
} from "../../application/ports/webhook-delivery.port";

const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;

function toRecord(row: typeof wd.$inferSelect): WebhookDeliveryRecord {
  return {
    id: row.id,
    endpointId: row.endpointId,
    outboxEventId: row.outboxEventId,
    eventType: row.eventType,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    lastResponseStatus: row.lastResponseStatus,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}

export class DrizzleWebhookDeliveryRepository implements IWebhookDeliveryRepository {
  async list(args: ListDeliveriesArgs) {
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
    const nextCursor = hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null;
    return { items, nextCursor };
  }

  async findById(id: string, organizationId: string): Promise<WebhookDeliveryRecord | null> {
    const [row] = await db
      .select({ d: wd })
      .from(wd)
      .innerJoin(we, eq(wd.endpointId, we.id))
      .where(and(eq(wd.id, id), eq(we.organizationId, organizationId)))
      .limit(1);
    return row ? toRecord(row.d) : null;
  }

  async updateStatus(id: string, update: DeliveryUpdate, tx: Transaction): Promise<void> {
    await tx
      .update(wd)
      .set({
        status: update.status,
        attempts: update.attempts,
        nextAttemptAt: update.nextAttemptAt,
        lastError: update.lastError,
        lastResponseStatus: update.lastResponseStatus,
      })
      .where(eq(wd.id, id));
  }

  async findPendingBatch(limit: number, tx: Transaction): Promise<WebhookDeliveryRecord[]> {
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
    return rows.map(toRecord);
  }

  async enqueueReplay(
    deliveryId: string,
    organizationId: string,
    tx?: Transaction,
  ): Promise<WebhookDeliveryRecord | null> {
    const exec = tx ?? db;
    const existing = await this.findById(deliveryId, organizationId);
    if (!existing) return null;
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
    return row ? toRecord(row) : null;
  }
}
