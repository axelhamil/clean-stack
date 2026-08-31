// `/internal/sweep-audit-log` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { AuditRetention, SQL } from "@packages/drizzle";
import { and, auditLogSchema, eq, lt } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { di } from "../../container";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { countEligibleWithTimeout } from "./sweep-count";
import { sweepLockFor } from "./sweep-lock";
import { purgeBatchWithTimeout } from "./sweep-purge";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";
import { sweepSpans } from "./sweep-span";

type HonoEnv = { Variables: { logger: PinoLogger } };

const { auditLog } = auditLogSchema;

export const sweepAuditLogRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-audit-log", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;
    // One façade per request: the db-span budget is per run, and two labels can sweep
    // concurrently without sharing it.
    const spans = sweepSpans(di.IInstrumentation);

    // `and()` types as `SQL | undefined` (its signature allows zero/all-undefined
    // args); both arguments here are always defined, so the result is always `SQL` —
    // asserted rather than left `undefined`-typed so `purgeBatchWithTimeout`'s
    // fail-closed `where: SQL` catches a real regression instead of a false one.
    const filterFor = (bucket: AuditRetention, cutoff: Date): SQL =>
      and(eq(auditLog.retention, bucket), lt(auditLog.occurredAt, cutoff)) as SQL;

    // AuditEventSubscriber skips retention="none" rows (returns early) — "none" is never inserted in DB.
    // We only iterate operational + compliance (the two values in AUDIT_RETENTIONS enum).
    const result = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      spans,
      passes: (["operational", "compliance"] as const).map((bucket) => ({
        label: bucket,
        retentionDays:
          bucket === "operational"
            ? env.AUDIT_LOG_OPERATIONAL_RETENTION_DAYS
            : env.AUDIT_LOG_COMPLIANCE_RETENTION_DAYS,
        purgeBatch: (cutoff: Date, size: number) =>
          purgeBatchWithTimeout({
            table: auditLog,
            idColumn: auditLog.id,
            where: filterFor(bucket, cutoff),
            orderBy: auditLog.occurredAt,
            batchSize: size,
            spans,
          }),
        countEligible: (cutoff: Date) =>
          countEligibleWithTimeout(auditLog, filterFor(bucket, cutoff), spans),
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
      lock: sweepLockFor("sweep-audit-log", spans),
    });

    return c.json({
      ...result,
      deletedPerBucket: {
        operational: result.deletedPerPass.operational ?? 0,
        compliance: result.deletedPerPass.compliance ?? 0,
      },
    });
  });
