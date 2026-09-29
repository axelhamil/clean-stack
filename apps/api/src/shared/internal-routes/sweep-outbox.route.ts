// `/internal/sweep-outbox`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { and, isNotNull, lt, outboxSchema } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { requireFilter } from "./sweep-purge";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";
import { sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const event = outboxSchema.outboxEvent;
const LABEL = "sweep-outbox";

const isForeignKeyViolation = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message.includes("violates foreign key constraint") ||
    ("code" in err && (err as { code: string }).code === "23503"));

export const sweepOutboxRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-outbox", zV("json", sweepBodySchema), async (c) => {
    const logger = c.var.logger;

    const response = await runSweepRequest({
      label: LABEL,
      body: c.req.valid("json"),
      logger,
      passes: (spans) => [
        tableRetentionPass(
          {
            label: "default",
            retentionDays: env.OUTBOX_RETENTION_DAYS,
            table: event,
            idColumn: event.id,
            orderBy: event.dispatchedAt,
            filterFor: (cutoff) =>
              requireFilter(
                and(isNotNull(event.dispatchedAt), lt(event.dispatchedAt, cutoff)),
                LABEL,
              ),
            onBatchError: (err) => {
              if (!isForeignKeyViolation(err)) return "throw";

              logger.error(
                { err },
                "sweep-outbox FK violation, stopping the entire sweep (run sweep-webhook-delivery first)",
              );
              return "break";
            },
          },
          spans,
        ),
      ],
    });
    return c.json(response);
  });
