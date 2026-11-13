import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { z } from "zod";
import {
  type ApiTokenScanningRoutesDeps,
  createApiTokenScanningRoutes,
} from "../../../infra/http/routes/scanning/scanning";

let verifier = mockPort<ApiTokenScanningRoutesDeps["IGithubKeyVerifier"]>();
let handleLeak = mockPort<ApiTokenScanningRoutesDeps["HandleLeakReportUseCase"]>();

function makeApp() {
  return new Hono()
    .route(
      "/api/token-scanning",
      createApiTokenScanningRoutes({
        IGithubKeyVerifier: verifier,
        HandleLeakReportUseCase: handleLeak,
      }),
    )
    .onError(
      createErrorHandler({
        instrumentation: mockInstrumentation(),
        logger: mockPort<ILogger>(),
        isProduction: false,
      }),
    );
}

const errorBody = z.object({ error: z.object({ code: z.string() }) });
const ENTRY = { token: "clean_x", type: "api_token" };

function postScan(body: string) {
  return makeApp().request("/api/token-scanning/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "GITHUB-PUBLIC-KEY-IDENTIFIER": "key-1",
      "GITHUB-PUBLIC-KEY-SIGNATURE": "valid-sig",
    },
    body,
  });
}

describe("POST /api/token-scanning/github", () => {
  beforeEach(() => {
    verifier = mockPort<ApiTokenScanningRoutesDeps["IGithubKeyVerifier"]>();
    handleLeak = mockPort<ApiTokenScanningRoutesDeps["HandleLeakReportUseCase"]>();
    verifier.verify.mockResolvedValue(true);
    handleLeak.execute.mockImplementation(async ({ entries }) =>
      Result.ok(
        entries.map((entry) => ({
          token_raw: entry.token,
          token_type: entry.type,
          label: "false_positive" as const,
        })),
      ),
    );
  });

  it("returns 403 when a signature header is missing, even on an unparsable body", async () => {
    const res = await makeApp().request("/api/token-scanning/github", {
      method: "POST",
      headers: { "content-type": "application/json", "GITHUB-PUBLIC-KEY-IDENTIFIER": "key-1" },
      body: "not json",
    });

    expect(res.status).toBe(403);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("verifies the signature over the exact raw body and refuses an invalid one", async () => {
    verifier.verify.mockResolvedValue(false);
    const body = JSON.stringify([ENTRY]);

    const res = await postScan(body);

    expect(res.status).toBe(403);
    expect(verifier.verify).toHaveBeenCalledWith("key-1", "valid-sig", body);
    expect(handleLeak.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when the signed body is not JSON", async () => {
    const res = await postScan("not json");

    expect(res.status).toBe(400);
    expect(handleLeak.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when the signed body is valid JSON but not a list of scan entries", async () => {
    const res = await postScan(JSON.stringify(ENTRY));

    expect(res.status).toBe(400);
    expect(handleLeak.execute).not.toHaveBeenCalled();
  });

  it("answers with the verdicts of the report", async () => {
    const res = await postScan(JSON.stringify([ENTRY]));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { token_raw: "clean_x", token_type: "api_token", label: "false_positive" },
    ]);
  });

  it("surfaces a provider failure through the central error envelope", async () => {
    handleLeak.execute.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const res = await postScan(JSON.stringify([ENTRY]));

    expect(res.status).toBe(502);
    expect(errorBody.parse(await res.json()).error.code).toBe("API_TOKEN_PROVIDER_FAILURE");
  });
});
