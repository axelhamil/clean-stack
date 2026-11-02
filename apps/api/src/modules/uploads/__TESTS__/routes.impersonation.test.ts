import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";

mock.module("../../../container", () => ({
  di: {
    PolicyAcceptanceService: { hasAcceptedCurrent: mock(async () => Result.ok(true)) },
    UploadService: {
      createUploadUrl: mock(async () => Result.ok({ url: "https://s3.test/put", key: "k" })),
      confirmUpload: mock(async () => Result.ok({ url: "https://cdn.test/k" })),
      createDownloadUrl: mock(async () => Result.ok({ url: "https://s3.test/get" })),
      deleteUpload: mock(async () => Result.ok({ deleted: true })),
    },
  },
}));

const realAuthMiddleware = await import("../../../shared/middleware/auth.middleware");
mock.module("../../../shared/middleware/auth.middleware", () => ({
  ...realAuthMiddleware,
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", { id: "session-1", impersonatedBy: "admin-1" });
    await next();
  },
}));

const { uploadsRoutes } = await import("../routes");

function send(method: string, path: string, body: unknown) {
  const app = new Hono().route("/uploads", uploadsRoutes);
  app.onError(createErrorHandler(mockInstrumentation()));

  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("uploads routes under impersonation", () => {
  it("refuses every write", async () => {
    for (const [method, path, body] of WRITES) {
      const res = await send(method, path, body);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  it("keeps the download read available", async () => {
    const res = await send("POST", "/uploads/download", KEY);
    expect(res.status).toBe(200);
  });
});
