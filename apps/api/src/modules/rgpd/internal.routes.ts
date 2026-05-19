// `/internal/*` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
import { zValidator } from "@hono/zod-validator";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { env } from "../../shared/env";
import { internalLayers } from "../../shared/internal-routes/internal-layers";
import { sweepBodySchema } from "./application/dto/process-pending-deletions.dto";

export const rgpdInternalRoutes = new Hono()
  .use("*", ...internalLayers)
  .post("/rgpd-sweep", zValidator("json", sweepBodySchema), async (c) => {
    const body = c.req.valid("json");
    const result = await di.RgpdService.processPendingDeletions({
      batchSize: body.batchSize ?? env.RGPD_SWEEP_BATCH_SIZE ?? 50,
      dryRun: body.dryRun,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  });
