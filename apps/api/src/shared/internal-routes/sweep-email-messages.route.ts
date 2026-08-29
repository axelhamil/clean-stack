// `/internal/sweep-email-messages` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import {
  type AnyPgColumn,
  and,
  count,
  db,
  emailSchema,
  eq,
  inArray,
  lt,
  sql,
} from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import {
  type RetentionPass,
  runRetentionSweep,
  type SweepBody,
  sweepBodySchema,
} from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const em = emailSchema.emailMessage;

const sentPredicate = (cutoff: Date) => and(eq(em.status, "sent"), lt(em.sentAt, cutoff));
const failedPredicate = (cutoff: Date) => and(eq(em.status, "failed"), lt(em.createdAt, cutoff));

async function countEligible(where: ReturnType<typeof sentPredicate>): Promise<number> {
  const rows = await db.select({ count: count() }).from(em).where(where);
  return rows[0]?.count ?? 0;
}

async function purgeBatch(
  where: ReturnType<typeof sentPredicate>,
  orderBy: AnyPgColumn,
  batchSize: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: em.id })
      .from(em)
      .where(where)
      .orderBy(orderBy)
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const deleted = await tx.delete(em).where(inArray(em.id, subq)).returning({ id: em.id });
    return deleted.length;
  });
}

export function buildEmailSweepPasses(): RetentionPass[] {
  return [
    {
      label: "sent",
      retentionDays: env.EMAIL_MESSAGE_RETENTION_DAYS,
      countEligible: (cutoff) => countEligible(sentPredicate(cutoff)),
      purgeBatch: (cutoff, size) => purgeBatch(sentPredicate(cutoff), em.sentAt, size),
    },
    {
      label: "failed",
      retentionDays: env.EMAIL_MESSAGE_FAILED_RETENTION_DAYS,
      countEligible: (cutoff) => countEligible(failedPredicate(cutoff)),
      purgeBatch: (cutoff, size) => purgeBatch(failedPredicate(cutoff), em.createdAt, size),
    },
  ];
}

export const sweepEmailMessagesRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-email-messages", zV("json", sweepBodySchema), async (c) => {
    const response = await runRetentionSweep({
      body: c.req.valid("json") as SweepBody,
      passes: buildEmailSweepPasses(),
      logger: c.var.logger,
      label: "sweep-email-messages",
      deadlineMs: env.SWEEP_DEADLINE_MS,
    });
    return c.json(response);
  });
