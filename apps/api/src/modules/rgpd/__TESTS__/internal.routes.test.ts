import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { env } from "../../../shared/env";
import {
  buildSignatureHeader,
  canonicalize,
  SIGNATURE_HEADER,
  sign,
} from "../../../shared/internal-routes/internal-signature";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";

type SweepOutput = {
  processed: number;
  succeeded: string[];
  failed: Array<{ userId: string; errorCode: string }>;
  dryRun: boolean;
  truncated: boolean;
};
type SweepResult = Result<SweepOutput, { code: string; message: string }>;

const SWEEP_OK: SweepOutput = {
  processed: 2,
  succeeded: ["u1", "u2"],
  failed: [],
  dryRun: false,
  truncated: false,
};

const mockedExecute = mock<(...args: unknown[]) => Promise<SweepResult>>(async () =>
  Result.ok(SWEEP_OK),
);

mock.module("../../../container", () => ({
  di: {
    RgpdService: { processPendingDeletions: mockedExecute },
  },
}));

const { rgpdInternalRoutes } = await import("../internal.routes");

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/internal", rgpdInternalRoutes);
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

async function postSignedSweep(body: object) {
  const headers = await signedHeaders("POST", "/internal/rgpd-sweep", body);

  return makeApp().request("/internal/rgpd-sweep", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /internal/rgpd-sweep", () => {
  beforeEach(() => {
    mockedExecute.mockClear();
    mockedExecute.mockResolvedValue(Result.ok(SWEEP_OK));
  });

  describe("when the request carries a valid signature", () => {
    it("should pass through to the use case and return its output", async () => {
      const res = await postSignedSweep({ dryRun: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        processed: 2,
        succeeded: ["u1", "u2"],
        failed: [],
      });
    });

    it("should forward the validated body fields to the use case", async () => {
      await postSignedSweep({ batchSize: 25, dryRun: true });
      expect(mockedExecute).toHaveBeenCalledWith({
        batchSize: 25,
        dryRun: true,
        deadlineMs: env.SWEEP_DEADLINE_MS,
      });
    });

    it("should fall back to the env default batchSize when omitted", async () => {
      await postSignedSweep({ dryRun: false });
      expect(mockedExecute).toHaveBeenCalledWith({
        batchSize: env.RGPD_SWEEP_BATCH_SIZE,
        dryRun: false,
        deadlineMs: env.SWEEP_DEADLINE_MS,
      });
    });
  });

  describe("when the signature header is missing", () => {
    it("should reject with 401 before zod validation runs", async () => {
      const res = await makeApp().request("/internal/rgpd-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost" },
        body: JSON.stringify({ dryRun: true }),
      });
      expect(res.status).toBe(401);
      expect(mockedExecute).not.toHaveBeenCalled();
    });
  });

  describe("when the body fails zod validation", () => {
    it("should reject with 400 (batchSize must be positive)", async () => {
      const res = await postSignedSweep({ batchSize: -1 });
      expect(res.status).toBe(400);
      expect(mockedExecute).not.toHaveBeenCalled();
    });

    it("should reject with 400 when batchSize exceeds the cap", async () => {
      const res = await postSignedSweep({ batchSize: 10000 });
      expect(res.status).toBe(400);
    });
  });

  describe("when the use case returns Result.fail", () => {
    it("should map AppError suffix to its HTTP status via errorHandler", async () => {
      mockedExecute.mockResolvedValueOnce(
        Result.fail({
          code: "ACCOUNT_DELETION_NOT_FOUND",
          message: "user vanished",
        }),
      );
      const res = await postSignedSweep({ dryRun: false });
      expect(res.status).toBe(404);
      const errBody = (await res.json()) as { error: { code: string } };
      expect(errBody.error.code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    });
  });
});
