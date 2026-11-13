// `/internal/flush-notification-emails`, gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { sweepSpans } from "@packages/drizzle/sweep-span";
import { type SweepBeat, withSweepHeartbeat } from "@packages/http/sweep-heartbeat";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { di } from "../../container";
import { internalLayers } from "./internal-layers";

type HonoEnv = { Variables: { logger: PinoLogger } };

const bodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(5000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

interface FlushResponse {
  dryRun: boolean;
  skipped?: boolean;
  flushed: number;
}

const DEFAULT_BATCH_SIZE = 500;
const FLUSH_LABEL = "flush-notification-emails";

export function beatOfFlush(response: FlushResponse): SweepBeat | undefined {
  if (response.dryRun || response.skipped) return undefined;

  return { outcome: "ok", count: response.flushed };
}

function failedFlush(error: { code: string; message: string }): HTTPException {
  return new HTTPException(502, { message: `${error.code}: ${error.message}` });
}

export const flushNotificationEmailsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/flush-notification-emails", zV("json", bodySchema), async (c) => {
    const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = c.req.valid("json");
    const spans = sweepSpans(di.IInstrumentation);
    const response = await withSweepHeartbeat(
      { label: FLUSH_LABEL, store: di.ISweepRunStore, spans, beatOf: beatOfFlush, dryRun },
      async () => {
        const flushed = await di.FlushNotificationDigestUseCase.execute({ batchSize, dryRun });
        if (flushed.isFailure) throw failedFlush(flushed.getError());

        return flushed.getValue();
      },
    );

    return c.json(response);
  });
