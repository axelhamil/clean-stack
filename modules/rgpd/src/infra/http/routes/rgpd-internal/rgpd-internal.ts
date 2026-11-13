// `/internal/*`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import type { RouteGuard } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { RgpdSettings } from "../../../../application/config/rgpd-settings";
import type { RgpdError } from "../../../../application/ports/repositories/deletion-state.port";
import type {
  ProcessPendingDeletionsInput,
  ProcessPendingDeletionsOutput,
} from "../../../../application/usecases/process-pending-deletions/process-pending-deletions.dto";
import { sweepBodySchema } from "./rgpd-internal.schema";

export interface RgpdInternalRoutesDeps {
  internalGuards: readonly RouteGuard[];
  ProcessPendingDeletionsUseCase: IUseCase<
    ProcessPendingDeletionsInput,
    ProcessPendingDeletionsOutput,
    RgpdError
  >;
  rgpdSettings: Pick<RgpdSettings, "sweepBatchSize" | "sweepDeadlineMs">;
}

export function createRgpdInternalRoutes(deps: RgpdInternalRoutesDeps) {
  return new Hono()
    .use("*", ...deps.internalGuards)
    .post("/rgpd-sweep", zV("json", sweepBodySchema), async (c) => {
      const body = c.req.valid("json");
      const result = await deps.ProcessPendingDeletionsUseCase.execute({
        batchSize: body.batchSize ?? deps.rgpdSettings.sweepBatchSize,
        dryRun: body.dryRun,
        deadlineMs: deps.rgpdSettings.sweepDeadlineMs,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    });
}
