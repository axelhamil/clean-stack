// `/internal/sweep-audit-log` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { AuditRetention } from "@packages/drizzle";
import { and, auditLogSchema, count, db, eq, inArray, lt, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { runBatchedSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const { auditLog } = auditLogSchema;

async function countEligible(bucket: AuditRetention, cutoff: Date): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(auditLog)
    .where(and(eq(auditLog.retention, bucket), lt(auditLog.occurredAt, cutoff)));
  return rows[0]?.count ?? 0;
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

export const sweepAuditLogRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-audit-log", zV("json", sweepBodySchema), async (c) => {
    const body = c.req.valid("json") as SweepBody;
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
    const sweepBucket = (bucket: AuditRetention) =>
      runBatchedSweep({
        purgeBatch: (size) => purgeBatch(bucket, cutoffs[bucket], size),
        countEligible: () => countEligible(bucket, cutoffs[bucket]),
        batchSize,
        dryRun,
        logger,
        label: `sweep-audit-log:${bucket}`,
        onBatchError: (err) => {
          logger.error(
            { err, bucket },
            "sweep-audit-log batch failed — stopping sweep for this bucket",
          );
          return "break";
        },
      });

    const { deleted: operational } = await sweepBucket("operational");
    const { deleted: compliance } = await sweepBucket("compliance");

    const deletedPerBucket = { operational, compliance };
    const durationMs = Date.now() - startMs;

    logger.info({ deletedPerBucket, durationMs, dryRun }, "sweep-audit-log done");

    return c.json({ deletedPerBucket, durationMs, dryRun });
  });
