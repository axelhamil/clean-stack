// `/internal/sweep-webhook-delivery` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, db, inArray, lt, sql, webhooksSchema } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";

type HonoEnv = { Variables: { logger: PinoLogger } };

const MAX_BATCHES = 1000;
const INTER_BATCH_SLEEP_MS = 50;

const sweepWebhookDeliveryBodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(50000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

type SweepWebhookDeliveryBody = z.infer<typeof sweepWebhookDeliveryBodySchema>;

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
  .post("/sweep-webhook-delivery", zV("json", sweepWebhookDeliveryBodySchema), async (c) => {
    const body = c.req.valid("json") as SweepWebhookDeliveryBody;
    const batchSize = body.batchSize ?? 5000;
    const dryRun = body.dryRun ?? false;
    const retentionDays = env.WEBHOOK_DELIVERY_RETENTION_DAYS;
    const logger = c.var.logger;

    logger.info({ retentionDays, batchSize, dryRun }, "sweep-webhook-delivery started");

    const startMs = Date.now();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    if (dryRun) {
      const deleted = await countEligible(cutoff);
      const durationMs = Date.now() - startMs;
      logger.info({ deleted, durationMs, batchCount: 0, dryRun }, "sweep-webhook-delivery done");
      return c.json({ deleted, durationMs, dryRun, batchCount: 0 });
    }

    let totalDeleted = 0;
    let batchCount = 0;

    while (batchCount < MAX_BATCHES) {
      const deletedInBatch = await purgeBatch(cutoff, batchSize);

      totalDeleted += deletedInBatch;
      batchCount++;

      if (deletedInBatch === 0) break;

      if (batchCount < MAX_BATCHES) {
        // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
        await Bun.sleep(INTER_BATCH_SLEEP_MS);
      }
    }

    if (batchCount >= MAX_BATCHES) {
      logger.warn(
        { batchCount: MAX_BATCHES },
        "sweep-webhook-delivery hit batch cap — stopping early",
      );
    }

    const durationMs = Date.now() - startMs;
    logger.info(
      { deleted: totalDeleted, durationMs, batchCount, dryRun },
      "sweep-webhook-delivery done",
    );

    return c.json({ deleted: totalDeleted, durationMs, dryRun, batchCount });
  });
