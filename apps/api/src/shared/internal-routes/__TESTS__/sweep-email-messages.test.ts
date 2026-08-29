import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { env } from "../../env";
import { createErrorHandler } from "../../middleware/error.middleware";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { buildSignatureHeader, canonicalize, SIGNATURE_HEADER, sign } from "../internal-signature";

let captured: { passes: { label: string; retentionDays: number }[] } | null = null;

const {
  sweepBodySchema: realSweepBodySchema,
  runBatchedSweep: realRunBatchedSweep,
  MAX_BATCHES: realMaxBatches,
  INTER_BATCH_SLEEP_MS: realInterBatchSleepMs,
} = await import("../sweep-runner");

// Expose the FULL export surface — bun's mock.module leaks across files, so a partial
// mock here can surface as a missing-export error in a sibling test file that imports
// the real module (see apps/api/src/shared/CLAUDE.md on this anti-pattern).
mock.module("../sweep-runner", () => ({
  runRetentionSweep: async (opts: never) => {
    captured = opts as never;
    return { deleted: 0, durationMs: 0, dryRun: true, batchCount: 0, deletedPerPass: {} };
  },
  runBatchedSweep: realRunBatchedSweep,
  sweepBodySchema: realSweepBodySchema,
  MAX_BATCHES: realMaxBatches,
  INTER_BATCH_SLEEP_MS: realInterBatchSleepMs,
}));

const { sweepEmailMessagesRoutes } = await import("../sweep-email-messages.route");

function makeApp() {
  const app = new Hono();
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/internal", sweepEmailMessagesRoutes);
  return app;
}

async function signedHeaders(method: string, path: string, body: object) {
  const rawBody = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const message = canonicalize({
    timestamp: ts,
    method,
    path,
    host: "localhost",
    contentType: "application/json",
    rawBody,
  });
  return {
    [SIGNATURE_HEADER]: buildSignatureHeader(
      ts,
      await sign(message, env.INTERNAL_SIGNING_KEY ?? ""),
    ),
    host: "localhost",
    "Content-Type": "application/json",
  };
}

describe("POST /internal/sweep-email-messages", () => {
  it("declares a sent pass and a failed pass on separate retention knobs", async () => {
    const body = { dryRun: true };
    await makeApp().request("/internal/sweep-email-messages", {
      method: "POST",
      body: JSON.stringify(body),
      headers: await signedHeaders("POST", "/internal/sweep-email-messages", body),
    });

    expect(captured?.passes.map((p) => p.label)).toEqual(["sent", "failed"]);
    const failed = captured?.passes.find((p) => p.label === "failed");
    const sent = captured?.passes.find((p) => p.label === "sent");
    expect(sent?.retentionDays).toBe(7);
    expect(failed?.retentionDays).toBe(90);
    // The assertion that matters: the failed pass must NOT reuse the sent knob.
    expect(failed?.retentionDays).not.toBe(sent?.retentionDays);
  });
});
