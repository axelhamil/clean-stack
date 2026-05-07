// `/internal/*` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { di } from "../../container";
import { internalLayers } from "../../shared/middleware/internal-layers";
import { purgeAuditBodySchema } from "./application/dto/purge-audit.dto";

export const auditLogInternalRoutes = new Hono()
  .use("*", ...internalLayers)
  .post("/audit-log-purge", zValidator("json", purgeAuditBodySchema), async (c) => {
    const { olderThanDays, dryRun } = c.req.valid("json");
    const cutoff = new Date(Date.now() - olderThanDays * 86400 * 1000);
    if (dryRun) {
      return c.json({ deleted: 0, dryRun: true, cutoff: cutoff.toISOString() });
    }
    const deleted = await di.IAuditPort.purgeOperationalOlderThan(cutoff);
    return c.json({ deleted, dryRun: false, cutoff: cutoff.toISOString() });
  });
