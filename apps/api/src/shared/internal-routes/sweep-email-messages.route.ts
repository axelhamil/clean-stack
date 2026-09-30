// `/internal/sweep-email-messages`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, emailSchema, eq, lt } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { requireFilter } from "./sweep-purge";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";
import { type RetentionPass, sweepBodySchema } from "./sweep-runner";
import type { SweepSpans } from "./sweep-span";

type HonoEnv = { Variables: { logger: PinoLogger } };

const em = emailSchema.emailMessage;

export function buildEmailSweepPasses(spans: SweepSpans): RetentionPass[] {
  return [
    tableRetentionPass(
      {
        label: "sent",
        retentionDays: env.EMAIL_MESSAGE_RETENTION_DAYS,
        table: em,
        idColumn: em.id,
        orderBy: em.sentAt,
        filterFor: (cutoff) =>
          requireFilter(
            and(eq(em.status, "sent"), lt(em.sentAt, cutoff)),
            "sweep-email-messages:sent",
          ),
      },
      spans,
    ),
    tableRetentionPass(
      {
        label: "failed",
        retentionDays: env.EMAIL_MESSAGE_FAILED_RETENTION_DAYS,
        table: em,
        idColumn: em.id,
        orderBy: em.createdAt,
        filterFor: (cutoff) =>
          requireFilter(
            and(eq(em.status, "failed"), lt(em.createdAt, cutoff)),
            "sweep-email-messages:failed",
          ),
      },
      spans,
    ),
  ];
}

export const sweepEmailMessagesRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-email-messages", zV("json", sweepBodySchema), async (c) => {
    const response = await runSweepRequest({
      label: "sweep-email-messages",
      body: c.req.valid("json"),
      logger: c.var.logger,
      passes: buildEmailSweepPasses,
    });
    return c.json(response);
  });
