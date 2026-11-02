// `/internal/sweep-notifications`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { SQL } from "@packages/drizzle";
import { and, isNotNull, lt, notificationSchema } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { requireFilter } from "./sweep-purge";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";
import { sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const n = notificationSchema.notification;

export function buildPurgeFilter(cutoff: Date): SQL {
  return requireFilter(and(isNotNull(n.readAt), lt(n.createdAt, cutoff)), "sweep-notifications");
}

export const sweepNotificationsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-notifications", zV("json", sweepBodySchema), async (c) => {
    const response = await runSweepRequest({
      label: "sweep-notifications",
      body: c.req.valid("json"),
      logger: c.var.logger,
      passes: (spans) => [
        tableRetentionPass(
          {
            label: "default",
            retentionDays: env.NOTIFICATION_RETENTION_DAYS,
            table: n,
            idColumn: n.id,
            orderBy: n.createdAt,
            filterFor: buildPurgeFilter,
          },
          spans,
        ),
      ],
    });
    return c.json(response);
  });
