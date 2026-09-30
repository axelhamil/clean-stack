// `/internal/sweep-webhook-delivery`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, inArray, lt, webhooksSchema } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { requireFilter } from "./sweep-purge";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";
import { sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const TERMINAL_STATUSES = ["success", "dead_letter"] as const;
const LABEL = "sweep-webhook-delivery";

const wd = webhooksSchema.webhookDelivery;

export const sweepWebhookDeliveryRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-webhook-delivery", zV("json", sweepBodySchema), async (c) => {
    const response = await runSweepRequest({
      label: LABEL,
      body: c.req.valid("json"),
      logger: c.var.logger,
      passes: (spans) => [
        tableRetentionPass(
          {
            label: "default",
            retentionDays: env.WEBHOOK_DELIVERY_RETENTION_DAYS,
            table: wd,
            idColumn: wd.id,
            orderBy: wd.createdAt,
            filterFor: (cutoff) =>
              requireFilter(
                and(inArray(wd.status, [...TERMINAL_STATUSES]), lt(wd.createdAt, cutoff)),
                LABEL,
              ),
          },
          spans,
        ),
      ],
    });
    return c.json(response);
  });
