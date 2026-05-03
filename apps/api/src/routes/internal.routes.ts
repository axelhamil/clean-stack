import { zValidator } from "@hono/zod-validator";
import { AppErrorException } from "@packages/ddd-kit";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { env } from "../../common/env";
import { requireInternalSignature } from "../adapters/middleware/internal-signature.middleware";
import { requirePrivateNetwork } from "../adapters/middleware/private-network.middleware";
import { sweepBodySchema } from "../application/dto/process-pending-deletions.dto";
import { di } from "../di/container";

const LAYER_HANDLERS: Record<(typeof env.INTERNAL_AUTH_LAYERS)[number], MiddlewareHandler> = {
  signature: requireInternalSignature,
  "private-network": requirePrivateNetwork,
};

const layers = env.INTERNAL_AUTH_LAYERS.map((l) => LAYER_HANDLERS[l]);

export const internalRoutes = new Hono()
  .use("*", ...layers)
  .post("/gdpr-sweep", zValidator("json", sweepBodySchema), async (c) => {
    const body = c.req.valid("json");
    const result = await di.GdprService.processPendingDeletions({
      batchSize: body.batchSize ?? env.GDPR_SWEEP_BATCH_SIZE,
      dryRun: body.dryRun,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  });
