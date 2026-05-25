// `/internal/sweep-audit-log` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { AuditRetention } from "@packages/drizzle";
import { and, auditLogSchema, db, eq, inArray, lt, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";

type HonoEnv = { Variables: { logger: PinoLogger } };

const MAX_BATCHES = 1000;
const INTER_BATCH_SLEEP_MS = 50;

const sweepAuditLogBodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(50000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

type SweepAuditLogBody = z.infer<typeof sweepAuditLogBodySchema>;

const { auditLog } = auditLogSchema;

async function countEligible(bucket: AuditRetention, cutoff: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(auditLog)
    .where(and(eq(auditLog.retention, bucket), lt(auditLog.occurredAt, cutoff)));
  return Number(rows[0]?.count ?? 0);
}

async function purgeBatch(
  bucket: AuditRetention,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.retention, bucket), lt(auditLog.occurredAt, cutoff)))
      .orderBy(auditLog.occurredAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx
      .delete(auditLog)
      .where(inArray(auditLog.id, subq))
      .returning({ id: auditLog.id });

    return deleted.length;
  });
}

async function sweepBucket(
  bucket: AuditRetention,
  cutoff: Date,
  batchSize: number,
  dryRun: boolean,
  logger: PinoLogger,
): Promise<number> {
  if (dryRun) {
    return countEligible(bucket, cutoff);
  }

  let total = 0;
  let batchCount = 0;

  while (batchCount < MAX_BATCHES) {
    let deletedInBatch: number;
    try {
      deletedInBatch = await purgeBatch(bucket, cutoff, batchSize);
    } catch (err) {
      logger.error(
        { err, bucket, batchCount },
        "sweep-audit-log batch failed — stopping sweep for this bucket",
      );
      break;
    }
    total += deletedInBatch;
    batchCount++;

    if (deletedInBatch === 0) break;

    if (batchCount < MAX_BATCHES) {
      // biome-ignore lint/correctness/noUndeclaredVariables: Bun is a runtime global
      await Bun.sleep(INTER_BATCH_SLEEP_MS);
    }
  }

  if (batchCount >= MAX_BATCHES) {
    logger.warn(
      { bucket, batchCount: MAX_BATCHES },
      "sweep-audit-log hit batch cap — stopping early",
    );
  }

  return total;
}

export const sweepAuditLogRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-audit-log", zV("json", sweepAuditLogBodySchema), async (c) => {
    const body = c.req.valid("json") as SweepAuditLogBody;
    const batchSize = body.batchSize ?? 5000;
    const dryRun = body.dryRun ?? false;
    const logger = c.var.logger;

    logger.info(
      {
        buckets: {
          operational: env.AUDIT_LOG_OPERATIONAL_RETENTION_DAYS,
          compliance: env.AUDIT_LOG_COMPLIANCE_RETENTION_DAYS,
        },
        batchSize,
        dryRun,
      },
      "sweep-audit-log started",
    );

    const startMs = Date.now();
    const now = Date.now();

    const cutoffs: Record<AuditRetention, Date> = {
      operational: new Date(now - env.AUDIT_LOG_OPERATIONAL_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      compliance: new Date(now - env.AUDIT_LOG_COMPLIANCE_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    };

    // AuditEventSubscriber skips retention="none" rows (returns early) — "none" is never inserted in DB.
    // We only iterate operational + compliance (the two values in AUDIT_RETENTIONS enum).
    // Sequential to avoid saturating the Drizzle connection pool: each bucket may loop hundreds
    // of batched transactions, and running both buckets in parallel halves the headroom for prod traffic
    // sharing the same pool.
    const operational = await sweepBucket(
      "operational",
      cutoffs.operational,
      batchSize,
      dryRun,
      logger,
    );
    const compliance = await sweepBucket(
      "compliance",
      cutoffs.compliance,
      batchSize,
      dryRun,
      logger,
    );

    const deletedPerBucket = { operational, compliance };
    const durationMs = Date.now() - startMs;

    logger.info({ deletedPerBucket, durationMs, dryRun }, "sweep-audit-log done");

    return c.json({ deletedPerBucket, durationMs, dryRun });
  });
