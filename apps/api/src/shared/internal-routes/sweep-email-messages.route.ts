// `/internal/sweep-email-messages` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { SQL } from "@packages/drizzle";
import { and, emailSchema, eq, lt } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { di } from "../../container";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { countEligibleWithTimeout } from "./sweep-count";
import { sweepLockFor } from "./sweep-lock";
import { purgeBatchWithTimeout, requireFilter } from "./sweep-purge";
import {
  type RetentionPass,
  runRetentionSweep,
  type SweepBody,
  sweepBodySchema,
} from "./sweep-runner";
import type { SweepSpans } from "./sweep-span";
import { sweepSpans } from "./sweep-span";

type HonoEnv = { Variables: { logger: PinoLogger } };

const em = emailSchema.emailMessage;

const sentPredicate = (cutoff: Date): SQL =>
  requireFilter(and(eq(em.status, "sent"), lt(em.sentAt, cutoff)), "sweep-email-messages:sent");
const failedPredicate = (cutoff: Date): SQL =>
  requireFilter(
    and(eq(em.status, "failed"), lt(em.createdAt, cutoff)),
    "sweep-email-messages:failed",
  );

export function buildEmailSweepPasses(spans: SweepSpans): RetentionPass[] {
  return [
    {
      label: "sent",
      retentionDays: env.EMAIL_MESSAGE_RETENTION_DAYS,
      countEligible: (cutoff) => countEligibleWithTimeout(em, sentPredicate(cutoff), spans),
      purgeBatch: (cutoff, size) =>
        purgeBatchWithTimeout({
          table: em,
          idColumn: em.id,
          where: sentPredicate(cutoff),
          orderBy: em.sentAt,
          batchSize: size,
          spans,
        }),
    },
    {
      label: "failed",
      retentionDays: env.EMAIL_MESSAGE_FAILED_RETENTION_DAYS,
      countEligible: (cutoff) => countEligibleWithTimeout(em, failedPredicate(cutoff), spans),
      purgeBatch: (cutoff, size) =>
        purgeBatchWithTimeout({
          table: em,
          idColumn: em.id,
          where: failedPredicate(cutoff),
          orderBy: em.createdAt,
          batchSize: size,
          spans,
        }),
    },
  ];
}

export const sweepEmailMessagesRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-email-messages", zV("json", sweepBodySchema), async (c) => {
    const spans = sweepSpans(di.IInstrumentation);
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      spans,
      passes: buildEmailSweepPasses(spans),
      logger: c.var.logger,
      label: "sweep-email-messages",
      deadlineMs: env.SWEEP_DEADLINE_MS,
      lock: sweepLockFor("sweep-email-messages", spans),
    });
    return c.json(response);
  });
