// `/internal/sweep-admin-*`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// `sweep-admin-approvals` moves pending approvals past their deadline to `expired`, `sweep-admin-impersonations`
// deletes impersonation sessions past their expiry; each announces one event per row in the batch's unit of work.

import { type AppError, AppErrorException, type Result } from "@packages/ddd-kit";
import { zV } from "@packages/http/validator";
import type { Context } from "hono";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { di } from "../../container";
import { internalLayers } from "../../shared/internal-routes/internal-layers";
import { runSweepRequest } from "../../shared/internal-routes/sweep-route";
import { type SweepBody, sweepBodySchema } from "../../shared/internal-routes/sweep-runner";

type HonoEnv = { Variables: { logger: PinoLogger } };

async function valueOrThrow<T>(pending: Promise<Result<T, AppError>>): Promise<T> {
  const result = await pending;
  if (result.isFailure) throw new AppErrorException(result.getError());

  return result.getValue();
}

function dueRowsSweep(
  label: string,
  expireDue: (batchSize: number) => Promise<Result<number, AppError>>,
  countDue: () => Promise<Result<number, AppError>>,
) {
  return async (c: Context<HonoEnv>, body: SweepBody) => {
    const response = await runSweepRequest({
      label,
      body,
      logger: c.var.logger,
      passes: () => [
        {
          label: "default",
          retentionDays: 0,
          purgeBatch: (_cutoff, batchSize) => valueOrThrow(expireDue(batchSize)),
          countEligible: () => valueOrThrow(countDue()),
        },
      ],
    });

    return c.json(response);
  };
}

const sweepApprovals = dueRowsSweep(
  "sweep-admin-approvals",
  (batchSize) => di.ApprovalService.expireDue(batchSize),
  () => di.ApprovalService.countDue(),
);

const sweepImpersonations = dueRowsSweep(
  "sweep-admin-impersonations",
  (batchSize) => di.StaffService.expireImpersonations(batchSize),
  () => di.StaffService.countExpiredImpersonations(),
);

export const adminInternalRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/sweep-admin-approvals", zV("json", sweepBodySchema), (c) =>
    sweepApprovals(c, c.req.valid("json")),
  )
  .post("/sweep-admin-impersonations", zV("json", sweepBodySchema), (c) =>
    sweepImpersonations(c, c.req.valid("json")),
  );
