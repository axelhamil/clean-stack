// `/internal/sweep-outbox` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, db, inArray, isNotNull, lt, outboxSchema, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";

type HonoEnv = { Variables: { logger: PinoLogger } };

const MAX_BATCHES = 1000;
const INTER_BATCH_SLEEP_MS = 50;

const sweepOutboxBodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(50000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

type SweepOutboxBody = z.infer<typeof sweepOutboxBodySchema>;

async function countEligible(cutoff: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        isNotNull(outboxSchema.outboxEvent.dispatchedAt),
        lt(outboxSchema.outboxEvent.dispatchedAt, cutoff),
      ),
    );
  return Number(rows[0]?.count ?? 0);
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
  .post("/sweep-outbox", zV("json", sweepOutboxBodySchema), async (c) => {
    const body = c.req.valid("json") as SweepOutboxBody;
    const batchSize = body.batchSize ?? 5000;
    const dryRun = body.dryRun ?? false;
    const retentionDays = env.OUTBOX_RETENTION_DAYS;
    const logger = c.var.logger;

    logger.info({ retentionDays, batchSize, dryRun }, "sweep-outbox started");

    const startMs = Date.now();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    if (dryRun) {
      const deleted = await countEligible(cutoff);
      const durationMs = Date.now() - startMs;
      logger.info({ deleted, durationMs, batchCount: 0, dryRun }, "sweep-outbox done");
      return c.json({ deleted, durationMs, dryRun, batchCount: 0 });
    }

    let totalDeleted = 0;
    let batchCount = 0;

    while (batchCount < MAX_BATCHES) {
      let deletedInBatch: number;
      try {
        deletedInBatch = await purgeBatch(cutoff, batchSize);
      } catch (err) {
        const isFK =
          err instanceof Error &&
          (err.message.includes("violates foreign key constraint") ||
            ("code" in err && (err as { code: string }).code === "23503"));
        if (isFK) {
          logger.error(
            { err },
            "sweep-outbox FK violation — stopping the entire sweep (run sweep-webhook-delivery first)",
          );
          break;
        }
        throw err;
      }

      totalDeleted += deletedInBatch;
      batchCount++;

      if (deletedInBatch === 0) break;

      if (batchCount < MAX_BATCHES) {
        // biome-ignore lint/correctness/noUndeclaredVariables: Bun is a runtime global
        await Bun.sleep(INTER_BATCH_SLEEP_MS);
      }
    }

    if (batchCount >= MAX_BATCHES) {
      logger.warn({ batchCount: MAX_BATCHES }, "sweep-outbox hit batch cap — stopping early");
    }

    const durationMs = Date.now() - startMs;
    logger.info({ deleted: totalDeleted, durationMs, batchCount, dryRun }, "sweep-outbox done");

    return c.json({ deleted: totalDeleted, durationMs, dryRun, batchCount });
  });
