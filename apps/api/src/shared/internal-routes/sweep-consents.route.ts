// `/internal/sweep-consents`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// Purges ONLY guest (userId IS NULL) expired consent records. Authed records are compliance evidence, never purged.

import { and, consentSchema, isNull, lt } from "@packages/drizzle";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { env } from "../env";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { requireFilter } from "./sweep-purge";
import { runSweepRequest, tableRetentionPass } from "./sweep-route";
import { sweepBodySchema } from "./sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

const record = consentSchema.consentRecord;
const LABEL = "sweep-consents";

export const sweepConsentsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-consents", zV("json", sweepBodySchema), async (c) => {
    const response = await runSweepRequest({
      label: LABEL,
      body: c.req.valid("json"),
      logger: c.var.logger,
      passes: (spans) => [
        tableRetentionPass(
          {
            label: "default",
            retentionDays: env.CONSENT_RETENTION_DAYS,
            table: record,
            idColumn: record.id,
            orderBy: record.expiresAt,
            filterFor: (cutoff) =>
              requireFilter(and(isNull(record.userId), lt(record.expiresAt, cutoff)), LABEL),
          },
          spans,
        ),
      ],
    });
    return c.json(response);
  });
