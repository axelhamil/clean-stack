// `/internal/sweep-webhook-delivery` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { SQL } from "@packages/drizzle";
import { and, inArray, lt, webhooksSchema } from "@packages/drizzle";
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

const TERMINAL_STATUSES = ["success", "dead_letter"] as const;

const wd = webhooksSchema.webhookDelivery;
// `and()` types as `SQL | undefined`; both arguments here are always defined, so the
// result is always `SQL` — asserted rather than left `undefined`-typed so
// `purgeBatchWithTimeout`'s fail-closed `where: SQL` catches a real regression.
const filterFor = (cutoff: Date): SQL =>
  and(inArray(wd.status, [...TERMINAL_STATUSES]), lt(wd.createdAt, cutoff)) as SQL;

export const sweepWebhookDeliveryRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-webhook-delivery", zV("json", sweepBodySchema), async (c) => {
    const spans = sweepSpans(di.IInstrumentation);
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      spans,
      passes: [
        {
          label: "default",
          retentionDays: env.WEBHOOK_DELIVERY_RETENTION_DAYS,
          purgeBatch: (cutoff, size) =>
            purgeBatchWithTimeout({
              table: wd,
              idColumn: wd.id,
              where: filterFor(cutoff),
              orderBy: wd.createdAt,
              batchSize: size,
              spans,
            }),
          countEligible: (cutoff) => countEligibleWithTimeout(wd, filterFor(cutoff), spans),
        },
      ],
      logger: c.var.logger,
      label: "sweep-webhook-delivery",
      deadlineMs: env.SWEEP_DEADLINE_MS,
      lock: sweepLockFor("sweep-webhook-delivery", spans),
    });
    return c.json(response);
  });
