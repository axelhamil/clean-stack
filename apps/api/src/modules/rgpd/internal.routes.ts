// `/internal/*`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { AppErrorException, type IInstrumentation } from "@packages/ddd-kit";
import { sweepSpans } from "@packages/drizzle/sweep-span";
import type { RouteGuard } from "@packages/http/route-guards";
import { type SweepBeat, withSweepHeartbeat } from "@packages/http/sweep-heartbeat";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { RgpdSettings } from "./application/config/rgpd-settings";
import { sweepBodySchema } from "./application/dto/process-pending-deletions.dto";
import type {
  ProcessPendingDeletionsOutput,
  RgpdService,
} from "./application/services/rgpd.service";

export interface RgpdInternalRoutesDeps {
  internalGuards: readonly RouteGuard[];
  ISweepRunStore: ISweepRunStore;
  IInstrumentation: IInstrumentation;
  RgpdService: Pick<RgpdService, "processPendingDeletions">;
  rgpdSettings: Pick<RgpdSettings, "sweepBatchSize" | "sweepDeadlineMs">;
}

function beatOfDeletions(output: ProcessPendingDeletionsOutput): SweepBeat | undefined {
  if (output.dryRun) return undefined;

  const count = output.succeeded.length;
  if (output.failed.length > 0) return { outcome: "batch-error", count };

  return { outcome: output.truncated ? "truncated" : "ok", count };
}

export function createRgpdInternalRoutes(deps: RgpdInternalRoutesDeps) {
  return new Hono()
    .use("*", ...deps.internalGuards)
    .post("/rgpd-sweep", zV("json", sweepBodySchema), async (c) => {
      const body = c.req.valid("json");
      const output = await withSweepHeartbeat(
        {
          label: "rgpd-sweep",
          store: deps.ISweepRunStore,
          spans: sweepSpans(deps.IInstrumentation),
          beatOf: beatOfDeletions,
          dryRun: body.dryRun,
        },
        async () => {
          const result = await deps.RgpdService.processPendingDeletions({
            batchSize: body.batchSize ?? deps.rgpdSettings.sweepBatchSize,
            dryRun: body.dryRun,
            deadlineMs: deps.rgpdSettings.sweepDeadlineMs,
          });
          if (result.isFailure) throw new AppErrorException(result.getError());

          return result.getValue();
        },
      );

      return c.json(output);
    });
}
