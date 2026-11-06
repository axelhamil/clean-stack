import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { requireRateLimit } from "../../../shared/middleware/rate-limit.middleware";
import { ACCOUNT_DELETE_POLICY } from "../../../shared/middleware/rate-limit.policies";
import type {
  IRateLimiter,
  RateLimitDecision,
  RateLimitError,
} from "../../../shared/ports/rate-limiter.port";
import type { RgpdError } from "../application/ports/rgpd.port";
import type { RequestAccountDeletionOutput } from "../application/services/rgpd.service";
import { createRgpdRoutes, type RgpdRoutesDeps } from "../routes";

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
const requestAccountDeletion = mock(async () =>
  Result.ok<RequestAccountDeletionOutput, RgpdError>({
    pendingDeletionUntil: "2099-01-01T00:00:00.000Z",
  }),
);

const accountDeleteRateLimit = requireRateLimit(
  { limiter: { ...mockPort<IRateLimiter>(), consume }, outbox: mockPort<IOutboxRepository>() },
  ACCOUNT_DELETE_POLICY,
);

const routes = createRgpdRoutes({
  routeGuards: openRouteGuards({ userId: "user-1" }),
  accountDeleteRateLimit,
  RgpdService: { ...mockPort<RgpdRoutesDeps["RgpdService"]>(), requestAccountDeletion },
});

function postDelete() {
  const app = new Hono<{ Variables: { user: { id: string } } }>()
    .use("*", async (c, next) => {
      c.set("user", { id: "user-1" });
      await next();
    })
    .route("/me", routes);
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
