// `/internal/sweep-webhook-delivery` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, db, inArray, lt, sql, webhooksSchema } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const TERMINAL_STATUSES = ["success", "dead_letter"] as const;

async function countEligible(cutoff: Date): Promise<number> {
  const wd = webhooksSchema.webhookDelivery;
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(wd)
    .where(and(inArray(wd.status, [...TERMINAL_STATUSES]), lt(wd.createdAt, cutoff)));
  return Number(rows[0]?.count ?? 0);
}

async function purgeBatch(cutoff: Date, batchSize: number): Promise<number> {
  const wd = webhooksSchema.webhookDelivery;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: wd.id })
      .from(wd)
      .where(and(inArray(wd.status, [...TERMINAL_STATUSES]), lt(wd.createdAt, cutoff)))
      .orderBy(wd.createdAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx.delete(wd).where(inArray(wd.id, subq)).returning({ id: wd.id });

    return deleted.length;
  });
}

export const sweepWebhookDeliveryRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-webhook-delivery", zV("json", sweepBodySchema), async (c) => {
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      retentionDays: env.WEBHOOK_DELIVERY_RETENTION_DAYS,
      purgeBatch,
      countEligible,
      logger: c.var.logger,
      label: "sweep-webhook-delivery",
    });
    return c.json(response);
  });
