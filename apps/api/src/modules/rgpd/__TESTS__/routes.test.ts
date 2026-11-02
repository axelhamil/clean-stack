import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { ACCOUNT_DELETE_POLICY } from "../../../shared/middleware/rate-limit.policies";
import type { RateLimitDecision, RateLimitError } from "../../../shared/ports/rate-limiter.port";

const consume = mock(async (_key: string) =>
  Result.ok<RateLimitDecision, RateLimitError>({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetSeconds: 900,
    policyName: ACCOUNT_DELETE_POLICY.name,
    firstBlock: false,
  }),
);
const requestAccountDeletion = mock(async () => Result.ok({ scheduled: true }));

mock.module("../../../container", () => ({
  di: {
    IRateLimiter: { consume },
    IOutboxRepository: { enqueue: mock(async () => undefined) },
    RgpdService: { requestAccountDeletion },
  },
}));

const realAuthMiddleware = await import("../../../shared/middleware/auth.middleware");
mock.module("../../../shared/middleware/auth.middleware", () => ({
  ...realAuthMiddleware,
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", { id: "session-1", impersonatedBy: null });
    await next();
  },
}));

const { rgpdMeRoutes } = await import("../routes");

function postDelete() {
  const app = new Hono().route("/me", rgpdMeRoutes);
  app.onError(createErrorHandler(mockInstrumentation()));

  return app.request("/me/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong-password" }),
  });
}

describe("POST /me/delete attempt budget", () => {
  beforeEach(() => {
    consume.mockClear();
    requestAccountDeletion.mockClear();
  });

  it("charges the attempt to the user, not to the address", async () => {
    await postDelete();

    expect(consume.mock.calls[0]?.[0]).toBe("account-delete:user-1");
  });

  it("answers 429 without touching the service once the budget is spent", async () => {
    consume.mockImplementationOnce(async () =>
      Result.ok<RateLimitDecision, RateLimitError>({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetSeconds: 900,
        policyName: ACCOUNT_DELETE_POLICY.name,
        firstBlock: false,
      }),
    );

    const res = await postDelete();

    expect(res.status).toBe(429);
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter store is down", async () => {
    consume.mockImplementationOnce(async () =>
      Result.fail<RateLimitDecision, RateLimitError>({
        code: "RATE_LIMITER_INTERNAL_ERROR",
        message: "store down",
      }),
    );

    const res = await postDelete();

    expect(res.status).toBe(503);
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });
});
