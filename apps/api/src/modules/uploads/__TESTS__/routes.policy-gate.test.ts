import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import type { IInstrumentation } from "../../../shared/ports/instrumentation.port";

const noopInstrumentation: IInstrumentation = {
  capture: () => {},
  startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
  addBreadcrumb: () => {},
  setSpanAttributes: () => {},
};

let stale = false;

mock.module("../../../container", () => ({
  di: {
    PolicyAcceptanceService: { hasAcceptedCurrent: mock(async () => Result.ok(!stale)) },
    UploadService: {
      createUploadUrl: mock(async () => Result.ok({ url: "https://s3.test/put", key: "k" })),
      confirmUpload: mock(async () => Result.ok({ url: "https://cdn.test/k" })),
      createDownloadUrl: mock(async () => Result.ok({ url: "https://s3.test/get" })),
      deleteUpload: mock(async () => Result.ok({ deleted: true })),
    },
  },
}));

mock.module("../../../shared/middleware/auth.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", { id: "session-1", impersonatedBy: null });
    await next();
  },
}));

const { uploadsRoutes } = await import("../routes");

function app() {
  const instance = new Hono().route("/uploads", uploadsRoutes);
  instance.onError(createErrorHandler(noopInstrumentation));
  return instance;
}

const MUTATIONS = [
  [
    "POST",
    "/uploads/presign",
    { filename: "avatar.png", contentType: "image/png", size: 1024, scope: "avatar" },
  ],
  [
    "POST",
    "/uploads/confirm",
    { key: "avatar/user-1.png", expectedSize: 1024, expectedContentType: "image/png" },
  ],
  ["POST", "/uploads/download", { key: "avatar/user-1.png" }],
  ["DELETE", "/uploads", { key: "avatar/user-1.png" }],
] as const;

/**
 * Uploading is product usage, not a data-subject right, so it belongs on the
 * gated side with profile/webhooks/tokens rather than in the exclusion list.
 * Nothing on `/legal/accept` uploads, so gating it cannot deadlock the only
 * route that clears the gate.
 */
describe("uploads routes are behind requireCurrentPolicies", () => {
  it("refuses every uploads mutation with POLICY_ACCEPTANCE_REQUIRED when acceptances are stale", async () => {
    stale = true;
    for (const [method, path, body] of MUTATIONS) {
      const res = await app().request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error: { code: string } };
      expect({ path, status: res.status, code: payload.error.code }).toEqual({
        path,
        status: 409,
        code: "POLICY_ACCEPTANCE_REQUIRED",
      });
    }
  });

  it("lets every uploads mutation through once acceptances are current", async () => {
    stale = false;
    for (const [method, path, body] of MUTATIONS) {
      const res = await app().request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });
});
