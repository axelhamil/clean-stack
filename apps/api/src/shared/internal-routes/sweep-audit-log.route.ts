// `/internal/sweep-audit-log`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import * as auditLogSchema from "@modules/audit-log/schemas/audit-log";
import { and, eq, lt } from "@packages/drizzle";
import { requireFilter } from "@packages/drizzle/sweep-purge";
import type { AuditRetention } from "@packages/events";
import { sweepBodySchema } from "@packages/http/sweep-runner";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { internalLayers } from "./internal-layers";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";

type HonoEnv = { Variables: { logger: PinoLogger } };

const { auditLog } = auditLogSchema;
const LABEL = "sweep-audit-log";

// AuditEventSubscriber skips retention="none" rows (returns early), so "none" is never
// inserted in DB. We only iterate operational + compliance (the two AUDIT_RETENTIONS values).
const BUCKETS = ["operational", "compliance"] as const satisfies readonly AuditRetention[];

const retentionDaysFor = (bucket: (typeof BUCKETS)[number]): number =>
  bucket === "operational"
    ? env.AUDIT_LOG_OPERATIONAL_RETENTION_DAYS
    : env.AUDIT_LOG_COMPLIANCE_RETENTION_DAYS;

export const sweepAuditLogRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-audit-log", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;

    const result = await runSweepRequest({
      label: LABEL,
      body: c.req.valid("json"),
      logger,
      passes: (spans) =>
        BUCKETS.map((bucket) =>
          tableRetentionPass(
            {
              label: bucket,
              retentionDays: retentionDaysFor(bucket),
              table: auditLog,
              idColumn: auditLog.id,
              orderBy: auditLog.occurredAt,
              filterFor: (cutoff) =>
                requireFilter(
                  and(eq(auditLog.retention, bucket), lt(auditLog.occurredAt, cutoff)),
                  LABEL,
                ),
              onBatchError: (err) => {
                logger.error(
                  { err, bucket },
                  "sweep-audit-log batch failed, stopping sweep for this bucket",
                );
                return "break";
              },
            },
            spans,
          ),
        ),
    });

    return c.json({
      ...result,
      deletedPerBucket: {
        operational: result.deletedPerPass.operational ?? 0,
        compliance: result.deletedPerPass.compliance ?? 0,
      },
    });
  });
