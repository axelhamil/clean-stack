// `/internal/sweep-email-messages` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, count, db, emailSchema, eq, inArray, lt, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

async function countEligible(cutoff: Date): Promise<number> {
  const em = emailSchema.emailMessage;
  const rows = await db
    .select({ count: count() })
    .from(em)
    .where(and(eq(em.status, "sent"), lt(em.sentAt, cutoff)));
  return rows[0]?.count ?? 0;
}

async function purgeBatch(cutoff: Date, batchSize: number): Promise<number> {
  const em = emailSchema.emailMessage;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: em.id })
      .from(em)
      .where(and(eq(em.status, "sent"), lt(em.sentAt, cutoff)))
      .orderBy(em.sentAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx.delete(em).where(inArray(em.id, subq)).returning({ id: em.id });
    return deleted.length;
  });
}

export const sweepEmailMessagesRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-email-messages", zV("json", sweepBodySchema), async (c) => {
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      passes: [
        {
          label: "sent",
          retentionDays: env.EMAIL_MESSAGE_RETENTION_DAYS,
          purgeBatch,
          countEligible,
        },
      ],
      logger: c.var.logger,
      label: "sweep-email-messages",
    });
    return c.json(response);
  });
