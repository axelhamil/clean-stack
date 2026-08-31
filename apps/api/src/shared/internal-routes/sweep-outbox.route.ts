// `/internal/sweep-outbox` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, isNotNull, lt, outboxSchema } from "@packages/drizzle";
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

const filterFor = (cutoff: Date) =>
  and(
    isNotNull(outboxSchema.outboxEvent.dispatchedAt),
    lt(outboxSchema.outboxEvent.dispatchedAt, cutoff),
  );

export const sweepOutboxRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-outbox", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;
    const spans = sweepSpans(di.IInstrumentation);
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      spans,
      passes: [
        {
          label: "default",
          retentionDays: env.OUTBOX_RETENTION_DAYS,
          purgeBatch: (cutoff, size) =>
            purgeBatchWithTimeout({
              table: outboxSchema.outboxEvent,
              idColumn: outboxSchema.outboxEvent.id,
              where: filterFor(cutoff),
              orderBy: outboxSchema.outboxEvent.dispatchedAt,
              batchSize: size,
              spans,
            }),
          countEligible: (cutoff) =>
            countEligibleWithTimeout(outboxSchema.outboxEvent, filterFor(cutoff), spans),
          onBatchError: (err) => {
            const isFK =
              err instanceof Error &&
              (err.message.includes("violates foreign key constraint") ||
                ("code" in err && (err as { code: string }).code === "23503"));
            if (isFK) {
              logger.error(
                { err },
                "sweep-outbox FK violation — stopping the entire sweep (run sweep-webhook-delivery first)",
              );
              return "break";
            }
            return "throw";
          },
        },
      ],
      logger,
      label: "sweep-outbox",
      deadlineMs: env.SWEEP_DEADLINE_MS,
      lock: sweepLockFor("sweep-outbox", spans),
    });
    return c.json(response);
  });
