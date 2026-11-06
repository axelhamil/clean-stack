import { describe, expect, it, mock } from "bun:test";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";

const realHonoBun = await import("hono/bun");
mock.module("hono/bun", () => ({
  ...realHonoBun,
  getConnInfo: () => ({ remote: { address: "198.51.100.20" } }),
}));

const { requireRateLimit } = await import("../middleware/rate-limit.middleware");
const { visitorCapRoutes } = await import("../middleware/rate-limit.policies");
const { createErrorHandler } = await import("../middleware/error.middleware");
const { memoryFactory, RateLimiterFlexibleAdapter } = await import(
  "../services/rate-limiter-flexible.adapter"
);

describe("accounts-per-visitor cap", () => {
  it("given no cap in the env, then no route is limited", () => {
    expect(visitorCapRoutes(undefined, 86_400)).toEqual([]);
  });

  it("given a cap, when one IP exceeds it, then the sign-up gets the rate-limit shape and one event", async () => {
    const [route] = visitorCapRoutes(2, 86_400);
    if (!route) throw new Error("the cap must mount one route");
    const [path, policy] = route;
    const outbox = mockPort<IOutboxRepository>();
    const limiter = new RateLimiterFlexibleAdapter(mockInstrumentation(), memoryFactory);
    const app = new Hono<{ Variables: { requestId: string; user: null } }>();
    app.use(path, requireRateLimit({ limiter, outbox }, policy));
    app.post(path, (c) => c.json({ ok: true }));
    app.onError(createErrorHandler(mockInstrumentation()));
    const signUp = () => app.request(path, { method: "POST" });

    expect((await signUp()).status).toBe(200);
    expect((await signUp()).status).toBe(200);
    const refused = await signUp();
    await signUp();

    expect(path).toBe("/sign-up/email");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({
      error: { code: "SECURITY_RATE_LIMITED", metadata: { retryAfter: expect.any(Number) } },
    });
    expect(enqueuedEvents(outbox).map((event) => event.payload)).toEqual([
      expect.objectContaining({ policyName: "accounts-per-visitor", ip: "198.51.100.20" }),
    ]);
  });
});
