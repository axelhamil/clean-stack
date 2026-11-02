import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";

const record = mock(async () => Result.ok({ categories: { analytics: true } }));
const withdraw = mock(async () => Result.ok());

mock.module("../../../container", () => ({
  di: { ConsentService: { record, withdraw } },
}));

const realIp = await import("../../../shared/middleware/rate-limit.ip");
mock.module("../../../shared/middleware/rate-limit.ip", () => ({
  ...realIp,
  resolveClientIp: () => "198.51.100.7",
}));

const { consentRoutes } = await import("../routes");

const IMPERSONATED = { id: "session-1", impersonatedBy: "admin-1" };

function send(method: "POST" | "DELETE", session: unknown) {
  const app = new Hono<{ Variables: { session: unknown; user: unknown } }>()
    .use("*", async (c, next) => {
      c.set("session", session);
      c.set("user", session ? { id: "user-1" } : null);
      await next();
    })
    .route("/consents", consentRoutes as never);
  app.onError(createErrorHandler(mockInstrumentation()));

  return app.request("/consents", {
    method,
    headers: { "content-type": "application/json", cookie: "cc_sid=subject-1" },
    body: method === "POST" ? JSON.stringify({ categories: [] }) : undefined,
  });
}

describe("consent writes under impersonation", () => {
  beforeEach(() => {
    record.mockClear();
    withdraw.mockClear();
  });

  it("refuses recording a consent for the impersonated user", async () => {
    const res = await send("POST", IMPERSONATED);

    expect(res.status).toBe(403);
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses withdrawing a consent for the impersonated user", async () => {
    const res = await send("DELETE", IMPERSONATED);

    expect(res.status).toBe(403);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("still lets an anonymous visitor record a consent", async () => {
    const res = await send("POST", null);

    expect(res.status).toBe(200);
  });
});
