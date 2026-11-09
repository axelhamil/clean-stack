// `/internal/sweep-admin-*`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// `sweep-admin-approvals` moves pending approvals past their deadline to `expired`, `sweep-admin-impersonations`
// deletes impersonation sessions past their expiry; each announces one event per row in the batch's unit of work.

import { type AppError, AppErrorException, type Result } from "@packages/ddd-kit";
import type { SweepSpans } from "@packages/drizzle/sweep-span";
import type { RouteGuard } from "@packages/http/route-guards";
import {
  type RetentionPass,
  type SweepBody,
  type SweepResponse,
  sweepBodySchema,
} from "@packages/http/sweep-runner";
import { zV } from "@packages/http/validator";
import type { Context } from "hono";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import type { ApprovalService } from "../../application/services/approval.service";
import type { StaffService } from "../../application/services/staff.service";

type HonoEnv = { Variables: { logger: PinoLogger } };

type SweepRequest = (opts: {
  label: string;
  body: SweepBody;
  logger: PinoLogger;
  passes: (spans: SweepSpans) => RetentionPass[];
}) => Promise<SweepResponse>;

export interface AdminInternalRoutesDeps {
  internalGuards: readonly RouteGuard[];
  runSweep: SweepRequest;
  ApprovalService: Pick<ApprovalService, "expireDue" | "countDue">;
  StaffService: Pick<StaffService, "expireImpersonations" | "countExpiredImpersonations">;
}

async function valueOrThrow<T>(pending: Promise<Result<T, AppError>>): Promise<T> {
  const result = await pending;
  if (result.isFailure) throw new AppErrorException(result.getError());

  return result.getValue();
}

function dueRowsSweep(
  runSweep: AdminInternalRoutesDeps["runSweep"],
  label: string,
  expireDue: (batchSize: number) => Promise<Result<number, AppError>>,
  countDue: () => Promise<Result<number, AppError>>,
) {
  return async (c: Context<HonoEnv>, body: SweepBody) => {
    const response = await runSweep({
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

export function createAdminInternalRoutes(deps: AdminInternalRoutesDeps) {
  const sweepApprovals = dueRowsSweep(
    deps.runSweep,
    "sweep-admin-approvals",
    (batchSize) => deps.ApprovalService.expireDue(batchSize),
    () => deps.ApprovalService.countDue(),
  );

  const sweepImpersonations = dueRowsSweep(
    deps.runSweep,
    "sweep-admin-impersonations",
    (batchSize) => deps.StaffService.expireImpersonations(batchSize),
    () => deps.StaffService.countExpiredImpersonations(),
  );

  return new Hono<HonoEnv>()
    .use("*", ...deps.internalGuards)
    .post("/sweep-admin-approvals", zV("json", sweepBodySchema), (c) =>
      sweepApprovals(c, c.req.valid("json")),
    )
    .post("/sweep-admin-impersonations", zV("json", sweepBodySchema), (c) =>
      sweepImpersonations(c, c.req.valid("json")),
    );
}
