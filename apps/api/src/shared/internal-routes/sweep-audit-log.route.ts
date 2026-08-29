// `/internal/sweep-audit-log` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { AuditRetention } from "@packages/drizzle";
import { and, auditLogSchema, count, db, eq, inArray, lt, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

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
    const logger = c.var.logger;

    // AuditEventSubscriber skips retention="none" rows (returns early) — "none" is never inserted in DB.
    // We only iterate operational + compliance (the two values in AUDIT_RETENTIONS enum).
    const result = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      passes: (["operational", "compliance"] as const).map((bucket) => ({
        label: bucket,
        retentionDays:
          bucket === "operational"
            ? env.AUDIT_LOG_OPERATIONAL_RETENTION_DAYS
            : env.AUDIT_LOG_COMPLIANCE_RETENTION_DAYS,
        purgeBatch: (cutoff: Date, size: number) => purgeBatch(bucket, cutoff, size),
        countEligible: (cutoff: Date) => countEligible(bucket, cutoff),
        onBatchError: (err: unknown) => {
          logger.error(
            { err, bucket },
            "sweep-audit-log batch failed — stopping sweep for this bucket",
          );
          return "break" as const;
        },
      })),
      logger,
      label: "sweep-audit-log",
      deadlineMs: env.SWEEP_DEADLINE_MS,
    });

    return c.json({
      deletedPerBucket: {
        operational: result.deletedPerPass.operational ?? 0,
        compliance: result.deletedPerPass.compliance ?? 0,
      },
      durationMs: result.durationMs,
      dryRun: result.dryRun,
    });
  });
