import { and, count, db, inArray, isNotNull, lt, notificationSchema, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

export function buildPurgeFilter(cutoff: Date) {
  const n = notificationSchema.notification;
  return and(isNotNull(n.readAt), lt(n.createdAt, cutoff));
}

async function countEligible(cutoff: Date): Promise<number> {
  const n = notificationSchema.notification;
  const rows = await db.select({ count: count() }).from(n).where(buildPurgeFilter(cutoff));
  return rows[0]?.count ?? 0;
}

async function purgeBatch(cutoff: Date, batchSize: number): Promise<number> {
  const n = notificationSchema.notification;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: n.id })
      .from(n)
      .where(buildPurgeFilter(cutoff))
      .orderBy(n.createdAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx.delete(n).where(inArray(n.id, subq)).returning({ id: n.id });
    return deleted.length;
  });
}

export const sweepNotificationsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-notifications", zV("json", sweepBodySchema), async (c) => {
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      passes: [
        {
          label: "default",
          retentionDays: env.NOTIFICATION_RETENTION_DAYS,
          purgeBatch,
          countEligible,
        },
      ],
      logger: c.var.logger,
      label: "sweep-notifications",
      deadlineMs: env.SWEEP_DEADLINE_MS,
    });
    return c.json(response);
  });
