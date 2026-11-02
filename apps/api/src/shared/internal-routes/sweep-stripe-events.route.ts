// `/internal/sweep-stripe-events`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { billingSchema, lt } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { requireFilter } from "./sweep-purge";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";
import { sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const event = billingSchema.stripeEvent;
const LABEL = "sweep-stripe-events";

export const sweepStripeEventsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-stripe-events", zV("json", sweepBodySchema), async (c) => {
    const response = await runSweepRequest({
      label: LABEL,
      body: c.req.valid("json"),
      logger: c.var.logger,
      passes: (spans) => [
        tableRetentionPass(
          {
            label: "default",
            retentionDays: env.STRIPE_EVENT_RETENTION_DAYS,
            table: event,
            idColumn: event.id,
            orderBy: event.receivedAt,
            filterFor: (cutoff) => requireFilter(lt(event.receivedAt, cutoff), LABEL),
          },
          spans,
        ),
      ],
    });

    return c.json(response);
  });
