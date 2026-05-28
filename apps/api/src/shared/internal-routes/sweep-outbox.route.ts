// `/internal/sweep-outbox` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, count, db, inArray, isNotNull, lt, outboxSchema, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

async function countEligible(cutoff: Date): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        isNotNull(outboxSchema.outboxEvent.dispatchedAt),
        lt(outboxSchema.outboxEvent.dispatchedAt, cutoff),
      ),
    );
  return rows[0]?.count ?? 0;
}

async function purgeBatch(cutoff: Date, batchSize: number): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: outboxSchema.outboxEvent.id })
      .from(outboxSchema.outboxEvent)
      .where(
        and(
          isNotNull(outboxSchema.outboxEvent.dispatchedAt),
          lt(outboxSchema.outboxEvent.dispatchedAt, cutoff),
        ),
      )
      .orderBy(outboxSchema.outboxEvent.dispatchedAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx
      .delete(outboxSchema.outboxEvent)
      .where(inArray(outboxSchema.outboxEvent.id, subq))
      .returning({ id: outboxSchema.outboxEvent.id });

    return deleted.length;
  });
}

export const sweepOutboxRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-outbox", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      retentionDays: env.OUTBOX_RETENTION_DAYS,
      purgeBatch,
      countEligible,
      logger,
      label: "sweep-outbox",
      onBatchError: (err) => {
        const isFK =
          err instanceof Error &&
          (err.message.includes("violates foreign key constraint") ||
            ("code" in err && (err as { code: string }).code === "23503"));
        if (isFK) {
          logger.error(
            { err },
            "sweep-outbox FK violation — stopping the entire sweep (run sweep-webhook-delivery first)",
          );
          return "break";
        }
        return "throw";
      },
    });
    return c.json(response);
  });
