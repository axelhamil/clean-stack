import { beforeEach, describe, expect, it } from "bun:test";
import { AppErrorException, Result } from "@packages/ddd-kit";
import type { RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { createUploadsRoutes, type UploadsRoutesDeps } from "../routes";

const uploads = mockPort<UploadsRoutesDeps["UploadService"]>();

beforeEach(() => {
  uploads.createUploadUrl.mockResolvedValue(
    Result.ok({
      url: "https://s3.test/put",
      key: "k",
      publicUrl: "https://cdn.test/k",
      expiresAt: "2026-01-01T00:00:00.000Z",
      expectedSize: 1024,
      expectedContentType: "image/png",
    }),
  );
  uploads.confirmUpload.mockResolvedValue(
    Result.ok({ key: "k", size: 1024, contentType: "image/png", publicUrl: "https://cdn.test/k" }),
  );
  uploads.createDownloadUrl.mockResolvedValue(
    Result.ok({ url: "https://s3.test/get", expiresAt: "2026-01-01T00:00:00.000Z" }),
  );
  uploads.deleteUpload.mockResolvedValue(Result.ok({ deleted: true }));
});

function send(guards: RouteGuards, method: string, path: string, body: unknown) {
  const app = new Hono().route(
    "/uploads",
    createUploadsRoutes({
      routeGuards: guards,
      uploadSettings: {
        maxUploadBytes: 1024 * 1024,
        presignTtlMinSeconds: 60,
        presignTtlMaxSeconds: 3600,
      },
      UploadService: uploads,
    }),
  );
  app.onError(createErrorHandler(mockInstrumentation()));

  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const signedIn = openRouteGuards({ userId: "user-1" });

const KEY = { key: "avatar/user-1.png" };

const WRITES = [
  [
    "POST",
    "/uploads/presign",
    { filename: "avatar.png", contentType: "image/png", size: 1024, scope: "avatar" },
  ],
  ["POST", "/uploads/confirm", { ...KEY, expectedSize: 1024, expectedContentType: "image/png" }],
  ["DELETE", "/uploads", KEY],
] as const;

const MUTATIONS = [...WRITES, ["POST", "/uploads/download", KEY]] as const;

describe("uploads routes under impersonation", () => {
  const refuseImpersonation: RouteGuard = async () => {
    throw new HTTPException(403, { message: "impersonating" });
  };
  const impersonating = { ...signedIn, denyImpersonated: refuseImpersonation };

  it("refuses every write", async () => {
    for (const [method, path, body] of WRITES) {
      const res = await send(impersonating, method, path, body);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  it("keeps the download read available", async () => {
    const res = await send(impersonating, "POST", "/uploads/download", KEY);
    expect(res.status).toBe(200);
  });
});

/**
 * Uploading is product usage, not a data-subject right, so it belongs on the
 * gated side with profile/webhooks/tokens rather than in the exclusion list.
 * Nothing on `/legal/accept` uploads, so gating it cannot deadlock the only
 * route that clears the gate.
 */
describe("uploads routes are behind requireCurrentPolicies", () => {
  const refuseStalePolicies: RouteGuard = async () => {
    throw new AppErrorException({
      code: "POLICY_ACCEPTANCE_REQUIRED",
      message: "Policy acceptance required",
    });
  };
  const stale = { ...signedIn, requireCurrentPolicies: refuseStalePolicies };

  it("refuses every uploads mutation with POLICY_ACCEPTANCE_REQUIRED when acceptances are stale", async () => {
    for (const [method, path, body] of MUTATIONS) {
      const res = await send(stale, method, path, body);
      const payload = (await res.json()) as { error: { code: string } };
      expect({ path, status: res.status, code: payload.error.code }).toEqual({
        path,
        status: 409,
        code: "POLICY_ACCEPTANCE_REQUIRED",
      });
    }
  });

  it("lets every uploads mutation through once acceptances are current", async () => {
    for (const [method, path, body] of MUTATIONS) {
      const res = await send(signedIn, method, path, body);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });
});
