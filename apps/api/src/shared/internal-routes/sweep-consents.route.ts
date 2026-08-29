// `/internal/sweep-consents` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// Purges ONLY guest (userId IS NULL) expired consent records. Authed records are compliance evidence — never purged.

import { and, consentSchema, count, db, inArray, isNull, lt, sql } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { acquireSweepLease, releaseSweepLease } from "./sweep-lock";
import { runRetentionSweep, type SweepBody, sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

async function countEligible(cutoff: Date): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(consentSchema.consentRecord)
    .where(
      and(
        isNull(consentSchema.consentRecord.userId),
        lt(consentSchema.consentRecord.expiresAt, cutoff),
      ),
    );
  return rows[0]?.count ?? 0;
}

async function purgeBatch(cutoff: Date, batchSize: number): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: consentSchema.consentRecord.id })
      .from(consentSchema.consentRecord)
      .where(
        and(
          isNull(consentSchema.consentRecord.userId),
          lt(consentSchema.consentRecord.expiresAt, cutoff),
        ),
      )
      .orderBy(consentSchema.consentRecord.expiresAt)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx
      .delete(consentSchema.consentRecord)
      .where(inArray(consentSchema.consentRecord.id, subq))
      .returning({ id: consentSchema.consentRecord.id });

    return deleted.length;
  });
}

export const sweepConsentsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-consents", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      passes: [
        {
          label: "default",
          retentionDays: env.CONSENT_RETENTION_DAYS,
          purgeBatch,
          countEligible,
        },
      ],
      logger,
      label: "sweep-consents",
      deadlineMs: env.SWEEP_DEADLINE_MS,
      lock: {
        acquire: () => acquireSweepLease("sweep-consents", env.SWEEP_DEADLINE_MS * 2),
        release: () => releaseSweepLease("sweep-consents"),
      },
    });
    return c.json(response);
  });
