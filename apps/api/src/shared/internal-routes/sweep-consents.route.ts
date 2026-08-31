// `/internal/sweep-consents` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// Purges ONLY guest (userId IS NULL) expired consent records. Authed records are compliance evidence — never purged.

import type { SQL } from "@packages/drizzle";
import { and, consentSchema, isNull, lt } from "@packages/drizzle";
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
const filterFor = (cutoff: Date): SQL =>
  and(
    isNull(consentSchema.consentRecord.userId),
    lt(consentSchema.consentRecord.expiresAt, cutoff),
  ) as SQL;

export const sweepConsentsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-consents", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;
    const spans = sweepSpans(di.IInstrumentation);
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      spans,
      passes: [
        {
          label: "default",
          retentionDays: env.CONSENT_RETENTION_DAYS,
          purgeBatch: (cutoff, size) =>
            purgeBatchWithTimeout({
              table: consentSchema.consentRecord,
              idColumn: consentSchema.consentRecord.id,
              where: filterFor(cutoff),
              orderBy: consentSchema.consentRecord.expiresAt,
              batchSize: size,
              spans,
            }),
          countEligible: (cutoff) =>
            countEligibleWithTimeout(consentSchema.consentRecord, filterFor(cutoff), spans),
        },
      ],
      logger,
      label: "sweep-consents",
      deadlineMs: env.SWEEP_DEADLINE_MS,
      lock: sweepLockFor("sweep-consents", spans),
    });
    return c.json(response);
  });
