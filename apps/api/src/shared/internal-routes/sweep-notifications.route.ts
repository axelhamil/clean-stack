import type { SQL } from "@packages/drizzle";
import { and, isNotNull, lt, notificationSchema } from "@packages/drizzle";
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

// `and()` types as `SQL | undefined`; both arguments here are always defined, so the
// result is always `SQL` — asserted rather than left `undefined`-typed so
// `purgeBatchWithTimeout`'s fail-closed `where: SQL` catches a real regression.
export function buildPurgeFilter(cutoff: Date): SQL {
  const n = notificationSchema.notification;
  return and(isNotNull(n.readAt), lt(n.createdAt, cutoff)) as SQL;
}

export const sweepNotificationsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-notifications", zV("json", sweepBodySchema), async (c) => {
    const n = notificationSchema.notification;
    const spans = sweepSpans(di.IInstrumentation);
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      spans,
      passes: [
        {
          label: "default",
          retentionDays: env.NOTIFICATION_RETENTION_DAYS,
          purgeBatch: (cutoff, size) =>
            purgeBatchWithTimeout({
              table: n,
              idColumn: n.id,
              where: buildPurgeFilter(cutoff),
              orderBy: n.createdAt,
              batchSize: size,
              spans,
            }),
          countEligible: (cutoff) => countEligibleWithTimeout(n, buildPurgeFilter(cutoff), spans),
        },
      ],
      logger: c.var.logger,
      label: "sweep-notifications",
      deadlineMs: env.SWEEP_DEADLINE_MS,
      lock: sweepLockFor("sweep-notifications", spans),
    });
    return c.json(response);
  });
