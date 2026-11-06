import { describe, expect, it, mock } from "bun:test";
import { Option, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { CurrentSession } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IAdminUserStore } from "../application/ports/admin-user-store.port";

const emitted: { type: string; payload: Record<string, unknown> }[] = [];

mock.module("@packages/outbox/event-emitter", () => ({
  emitEvent: mock(
    async (
      _o: unknown,
      type: string,
      _at: string,
      _ai: string,
      payload: Record<string, unknown>,
    ) => {
      emitted.push({ type, payload });
      return "evt-1";
    },
  ),
}));

const { AdminModerationService } = await import("../application/services/admin-moderation.service");
const { createAdminImpersonationRoutes } = await import("../admin-impersonation.routes");
const { Hono } = await import("hono");
const { createErrorHandler } = await import("../../../shared/middleware/error.middleware");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

const { unitOfWork } = mockUnitOfWork();

const impersonated = new Response(JSON.stringify({ session: { id: "s-9" } }), { status: 200 });
impersonated.headers.append("set-cookie", "session=impersonated; Path=/; HttpOnly");

const stopResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
stopResponse.headers.append("set-cookie", "session=admin-restored; Path=/; HttpOnly");

const mockImpersonateUser = mock(async (_userId: string, _headers: Headers) => impersonated);
const mockStopImpersonating = mock(async (_headers: Headers) => stopResponse);

const adminSession: CurrentSession = {
  id: "session-admin",
  userId: "admin-1",
  email: "admin-1@example.com",
  twoFactorEnabled: true,
  impersonatedBy: Option.none(),
};
let currentSession: CurrentSession = adminSession;

const routes = createAdminImpersonationRoutes({
  routeGuards: {
    ...openRouteGuards({ userId: "admin-1" }),
    currentSession: () => currentSession,
  },
  IAuthProvider: {
    impersonationTtlSeconds: 3600,
    impersonateUser: mockImpersonateUser,
    stopImpersonating: mockStopImpersonating,
  },
  AdminModerationService: new AdminModerationService(
    mockPort<IAdminUserStore>(),
    mockPort<IOutboxRepository>(),
    unitOfWork,
  ),
});

// Mounted behind the real error handler: a validation rejection is now an
// `AppErrorException`, which only Hono's `onError` turns into a 400; a bare
// sub-router would report it as an unhandled 500 and hide the contract.
const app = new Hono<{ Variables: { requestId: string } }>()
  .use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  })
  .route("/", routes);
app.onError(createErrorHandler(new NoOpInstrumentation()));

describe("POST /admin/impersonation/:id/start", () => {
  it("rejects a request without a reason", async () => {
    const res = await app.request("/u-2/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects self-impersonation", async () => {
    const res = await app.request("/admin-1/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "testing self" }),
    });
    expect(res.status).toBe(403);
  });

  it("relays the impersonation cookie and emits the start event", async () => {
    emitted.length = 0;
    const res = await app.request("/u-2/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "ticket 42: cannot upload avatar" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toContain("session=impersonated; Path=/; HttpOnly");
    const event = emitted.find((e) => e.type === EventTypes.ADMIN_IMPERSONATION_STARTED);
    expect(event?.payload.reason).toBe("ticket 42: cannot upload avatar");
    expect(event?.payload.actorUserId).toBe("admin-1");
    expect(event?.payload.userId).toBe("u-2");
    expect(event?.payload.actorUserId).not.toBe(event?.payload.userId);
  });

  it("returns 403 when BetterAuth refuses the impersonation", async () => {
    mockImpersonateUser.mockImplementationOnce(
      async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    );
    const res = await app.request("/u-2/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "test refusal" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /admin/impersonation/stop", () => {
  it("returns 400 when not impersonating", async () => {
    currentSession = adminSession;
    const res = await app.request("/stop", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 and announces nothing when BetterAuth refuses stop", async () => {
    emitted.length = 0;
    currentSession = {
      ...adminSession,
      userId: "target-2",
      impersonatedBy: Option.some("admin-1"),
    };
    mockStopImpersonating.mockImplementationOnce(
      async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    );
    const res = await app.request("/stop", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(emitted).toEqual([]);
  });

  it("stops outside any transaction and leaves the announcement to the session hook", async () => {
    emitted.length = 0;
    currentSession = {
      ...adminSession,
      userId: "target-2",
      impersonatedBy: Option.some("admin-1"),
    };
    let transactionAtStop: unknown = "unset";
    mockStopImpersonating.mockImplementationOnce(async () => {
      transactionAtStop = UnitOfWorkContext.transaction();

      return stopResponse;
    });
    const res = await app.request("/stop", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toContain("session=admin-restored; Path=/; HttpOnly");
    expect(transactionAtStop).toBeUndefined();
    expect(emitted).toEqual([]);
  });
});
