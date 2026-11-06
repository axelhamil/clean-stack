import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { z } from "zod";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import type { ApiTokenError } from "../../../shared/ports/api-token.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { LeakReportEntry, LeakVerdict } from "../application/services/token-leak.service";
import { createApiTokenScanningRoutes } from "../scanning.routes";

const verify = mock(async () => true);
const handleReport = mock(async (entries: LeakReportEntry[]) =>
  Result.ok<LeakVerdict[], ApiTokenError>(
    entries.map((e) => ({ token_raw: e.token, token_type: e.type, label: "false_positive" })),
  ),
);

const app = new Hono()
  .route(
    "/api/token-scanning",
    createApiTokenScanningRoutes({
      GithubKeyVerifier: { verify },
      TokenLeakService: { handleReport },
    }),
  )
  .onError(createErrorHandler(new NoOpInstrumentation()));

const errorBody = z.object({ error: z.object({ code: z.string() }) });

function postScan(body: string, headers: Record<string, string> = {}) {
  return app.request("/api/token-scanning/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "GITHUB-PUBLIC-KEY-IDENTIFIER": "key-1",
      "GITHUB-PUBLIC-KEY-SIGNATURE": "valid-sig",
      ...headers,
    },
    body,
  });
}

describe("POST /api/token-scanning/github", () => {
  beforeEach(() => {
    verify.mockClear();
    handleReport.mockClear();
    verify.mockImplementation(async () => true);
  });

  it("returns 403 when signature headers are missing", async () => {
    const res = await app.request("/api/token-scanning/github", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when the signature is invalid", async () => {
    verify.mockImplementation(async () => false);

    const res = await postScan(JSON.stringify([{ token: "clean_x", type: "api_token" }]));

    expect(res.status).toBe(403);
    expect(handleReport).not.toHaveBeenCalled();
  });

  it("returns 400 when the signed body is valid JSON but not a list of scan entries", async () => {
    const res = await postScan(JSON.stringify({ token: "clean_x", type: "api_token" }));

    expect(res.status).toBe(400);
    expect(handleReport).not.toHaveBeenCalled();
  });

  it("answers with the verdicts of the report", async () => {
    const res = await postScan(JSON.stringify([{ token: "clean_x", type: "api_token" }]));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { token_raw: "clean_x", token_type: "api_token", label: "false_positive" },
    ]);
  });

  it("surfaces a provider failure through the central error envelope", async () => {
    handleReport.mockImplementationOnce(async () =>
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const res = await postScan(JSON.stringify([{ token: "clean_x", type: "api_token" }]));

    expect(res.status).toBe(502);
    expect(errorBody.parse(await res.json()).error.code).toBe("API_TOKEN_PROVIDER_FAILURE");
  });
});
