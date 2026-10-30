// `/internal/sweep-admin-approvals`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// Moves pending approvals past their deadline to `expired`, one event per row in the batch's unit of work.

import { type AppError, AppErrorException, type Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { di } from "../../container";
import { internalLayers } from "../../shared/internal-routes/internal-layers";
import { runSweepRequest } from "../../shared/internal-routes/sweep-route";
import { sweepBodySchema } from "../../shared/internal-routes/sweep-runner";
import { zV } from "../../shared/validator";

type HonoEnv = { Variables: { logger: PinoLogger } };

const LABEL = "sweep-admin-approvals";

async function valueOrThrow<T>(pending: Promise<Result<T, AppError>>): Promise<T> {
  const result = await pending;
  if (result.isFailure) throw new AppErrorException(result.getError());

  return result.getValue();
}

export const adminInternalRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-admin-approvals", zV("json", sweepBodySchema), async (c) => {
    const response = await runSweepRequest({
      label: LABEL,
      body: c.req.valid("json"),
      logger: c.var.logger,
      passes: () => [
        {
          label: "default",
          retentionDays: 0,
          purgeBatch: (_cutoff, batchSize) => valueOrThrow(di.ApprovalService.expireDue(batchSize)),
          countEligible: () => valueOrThrow(di.ApprovalService.countDue()),
        },
      ],
    });

    return c.json(response);
  });
