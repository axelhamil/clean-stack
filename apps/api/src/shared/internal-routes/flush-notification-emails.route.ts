// `/internal/flush-notification-emails` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import {
  and,
  authSchema,
  count,
  db,
  eq,
  inArray,
  isNull,
  lte,
  notificationSchema,
  sql,
} from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { di } from "../../container";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";

type HonoEnv = { Variables: { logger: PinoLogger } };

const bodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(50000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

export type PendingRow = {
  id: string;
  userId: string;
  category: string;
  eventType: string;
  email: string;
  payload: unknown;
};

export type DigestGroup = {
  userId: string;
  email: string;
  category: string;
  notificationIds: string[];
  items: { eventType: string; payload: unknown }[];
};

export function buildDigests(rows: PendingRow[]): DigestGroup[] {
  const map = new Map<string, DigestGroup>();
  for (const row of rows) {
    const key = `${row.userId}:${row.category}`;
    const group = map.get(key);
    if (group) {
      group.notificationIds.push(row.id);
      group.items.push({ eventType: row.eventType, payload: row.payload });
    } else {
      map.set(key, {
        userId: row.userId,
        email: row.email,
        category: row.category,
        notificationIds: [row.id],
        items: [{ eventType: row.eventType, payload: row.payload }],
      });
    }
  }
  return [...map.values()];
}

export async function digestIdempotencyKey(ids: string[]): Promise<string> {
  const raw = ids.slice().sort().join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_BATCH_SIZE = 500;

export const flushNotificationEmailsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/flush-notification-emails", zV("json", bodySchema), async (c) => {
    const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = c.req.valid("json");
    const now = new Date();
    const logger = c.var.logger;
    const n = notificationSchema.notification;
    const u = authSchema.user;

    if (dryRun) {
      const rows = await db
        .select({ eligible: count() })
        .from(n)
        .where(and(lte(n.emailPendingAt, now), isNull(n.emailSentAt)));
      const eligible = rows[0]?.eligible ?? 0;
      logger.info({ eligible }, "flush-notification-emails dry-run");
      return c.json({ dryRun: true, eligible, flushed: 0, notifications: 0 });
    }

    const { flushed, notifications } = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

      const rows = await tx
        .select({
          id: n.id,
          userId: n.userId,
          category: n.category,
          eventType: n.eventType,
          email: u.email,
          payload: n.payload,
        })
        .from(n)
        .innerJoin(u, eq(n.userId, u.id))
        .where(and(lte(n.emailPendingAt, now), isNull(n.emailSentAt)))
        .limit(batchSize)
        .for("update", { skipLocked: true });

      if (rows.length === 0) return { flushed: 0, notifications: 0 };

      const digests = buildDigests(rows as PendingRow[]);

      const idempotencyKey = await digestIdempotencyKey(rows.map((r) => r.id));

      const enqueued = await di.IEmailService.sendTemplateBatch(
        "notification_digest",
        digests.map((d) => ({
          to: d.email,
          variables: {
            category: d.category,
            itemCount: String(d.items.length),
            itemsSummary: d.items.map((i) => i.eventType).join(", "),
          },
        })),
        {
          tx: tx as unknown as import("../transaction").ITransaction,
          idempotencyKey,
        },
      );

      if (enqueued.isFailure) {
        logger.error({ err: enqueued.getError() }, "flush-notification-emails enqueue failed");
        throw new Error(enqueued.getError().message);
      }

      const notificationIds = rows.map((r) => r.id);
      await tx.update(n).set({ emailSentAt: now }).where(inArray(n.id, notificationIds));

      logger.info(
        { flushed: digests.length, notifications: notificationIds.length },
        "flush-notification-emails done",
      );
      return { flushed: digests.length, notifications: notificationIds.length };
    });

    return c.json({ dryRun: false, flushed, notifications });
  });
