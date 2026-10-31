// `/internal/*`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { env } from "../../shared/env";
import { internalLayers } from "../../shared/internal-routes/internal-layers";
import { type SweepBeat, withSweepHeartbeat } from "../../shared/internal-routes/sweep-heartbeat";
import { sweepSpans } from "../../shared/internal-routes/sweep-span";
import { zV } from "../../shared/validator";
import { sweepBodySchema } from "./application/dto/process-pending-deletions.dto";
import type { ProcessPendingDeletionsOutput } from "./application/services/rgpd.service";

function beatOfDeletions(output: ProcessPendingDeletionsOutput): SweepBeat | undefined {
  if (output.dryRun) return undefined;

  const count = output.succeeded.length;
  if (output.failed.length > 0) return { outcome: "batch-error", count };

  return { outcome: output.truncated ? "truncated" : "ok", count };
}

export const rgpdInternalRoutes = new Hono()
  .use("*", ...internalLayers)
  .post("/rgpd-sweep", zV("json", sweepBodySchema), async (c) => {
    const body = c.req.valid("json");
    const output = await withSweepHeartbeat(
      {
        label: "rgpd-sweep",
        store: di.ISweepRunStore,
        spans: sweepSpans(di.IInstrumentation),
        beatOf: beatOfDeletions,
        dryRun: body.dryRun,
      },
      async () => {
        const result = await di.RgpdService.processPendingDeletions({
          batchSize: body.batchSize ?? env.RGPD_SWEEP_BATCH_SIZE ?? 50,
          dryRun: body.dryRun,
          deadlineMs: env.SWEEP_DEADLINE_MS,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return result.getValue();
      },
    );

    return c.json(output);
  });
