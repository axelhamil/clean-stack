import { describe, expect, it, mock } from "bun:test";
import { EventTypes } from "@packages/events";
import * as sweepSchema from "../../../../../../packages/drizzle/src/schema/sweep";

type SqlMarker = { _op: string; args: unknown[] };
const mk =
  (op: string) =>
  (...args: unknown[]): SqlMarker => ({ _op: op, args });

mock.module("@packages/drizzle", () => ({
  db: {
    select: () => ({}),
    insert: () => ({}),
    update: () => ({}),
    delete: () => ({}),
  },
  authSchema: {
    user: {
      id: {},
      email: {},
      name: {},
      role: {},
      banned: {},
      banReason: {},
      banExpires: {},
      twoFactorEnabled: {},
      createdAt: {},
    },
    session: {},
  },
  multiTenantSchema: { member: { userId: {}, organizationId: {} }, organization: { id: {} } },
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: { hash: {}, sequence: {}, id: {} } },
  webhooksSchema: {
    webhookEndpoint: {
      id: {},
      organizationId: {},
      url: {},
      secretCipher: {},
      eventTypes: {},
      enabled: {},
      createdAt: {},
      updatedAt: {},
      previousSecretCipher: {},
      previousSecretExpiresAt: {},
      consecutiveFailures: {},
      firstFailedAt: {},
      disabledAt: {},
    },
    webhookDelivery: {
      id: {},
      endpointId: {},
      outboxEventId: {},
      eventType: {},
      payload: {},
      status: {},
      attempts: {},
      nextAttemptAt: {},
      lastError: {},
      lastResponseStatus: {},
      idempotencyKey: {},
      createdAt: {},
    },
  },
  rateLimitSchema: { rateLimitRecord: { key: {}, points: {}, expire: {} } },
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
  notificationSchema: {
    notification: {
      id: { name: "id" },
      userId: { name: "user_id" },
      organizationId: { name: "organization_id" },
      category: { name: "category" },
      eventType: { name: "event_type" },
      groupKey: { name: "group_key" },
      dedupKey: { name: "dedup_key" },
      payload: { name: "payload" },
      readAt: { name: "read_at" },
      emailPendingAt: { name: "email_pending_at" },
      emailSentAt: { name: "email_sent_at" },
      createdAt: { name: "created_at" },
    },
    notificationPreference: {
      id: { name: "id" },
      scope: { name: "scope" },
      scopeId: { name: "scope_id" },
      category: { name: "category" },
      channel: { name: "channel" },
      enabled: { name: "enabled" },
      frequency: { name: "frequency" },
      locked: { name: "locked" },
    },
  },
  emailSchema: {},
  schema: {},
  TransactionService: class {},
  trackEventsOnSuccess: () => {},
  uuidv7: () => "generated-uuid",
  and: mk("and"),
  or: mk("or"),
  eq: mk("eq"),
  lt: mk("lt"),
  lte: mk("lte"),
  gt: mk("gt"),
  gte: mk("gte"),
  inArray: mk("inArray"),
  isNull: mk("isNull"),
  isNotNull: mk("isNotNull"),
  ilike: mk("ilike"),
  asc: mk("asc"),
  desc: mk("desc"),
  not: mk("not"),
  like: mk("like"),
  count: mk("count"),
  arrayContains: mk("arrayContains"),
  sql: Object.assign(mk("sql"), { raw: mk("sql.raw"), identifier: () => ({}) }),
  sweepSchema,
}));

mock.module("hono/bun", () => ({
  getConnInfo: () => ({ remote: { address: "127.0.0.1" } }),
}));

mock.module("../../../container", () => ({
  di: { IOutboxRepository: {}, IInstrumentation: {} },
}));

const emitted: { type: string; payload: Record<string, unknown> }[] = [];

mock.module("../../../shared/event-emitter", () => ({
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

const impersonated = new Response(JSON.stringify({ session: { id: "s-9" } }), { status: 200 });
impersonated.headers.append("set-cookie", "session=impersonated; Path=/; HttpOnly");

const stopResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
stopResponse.headers.append("set-cookie", "session=admin-restored; Path=/; HttpOnly");

const mockImpersonateUser = mock(async () => impersonated);
const mockStopImpersonating = mock(async () => stopResponse);

mock.module("../../../auth", () => ({
  auth: {
    api: {
      impersonateUser: mockImpersonateUser,
      stopImpersonating: mockStopImpersonating,
    },
  },
}));

let currentSession: Record<string, unknown> = {
  impersonatedBy: null,
  userId: "admin-1",
  createdAt: new Date(Date.now() - 10_000),
};

mock.module("../../../shared/middleware/auth.middleware", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "admin-1", role: "admin", twoFactorEnabled: true });
    c.set("session", currentSession);
    await next();
  },
  AuthVariables: {},
}));

const { adminImpersonationRoutes } = await import("../admin-impersonation.routes");
const { Hono } = await import("hono");
const { createErrorHandler } = await import("../../../shared/middleware/error.middleware");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

// Mounted behind the real error handler: a validation rejection is now an
// `AppErrorException`, which only Hono's `onError` turns into a 400 — a bare
// sub-router would report it as an unhandled 500 and hide the contract.
const app = new Hono<{ Variables: { requestId: string } }>()
  .use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  })
  .route("/", adminImpersonationRoutes);
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
    expect(res.status).toBe(400);
  });

  it("relays the impersonation cookie and emits the start event", async () => {
    emitted.length = 0;
    const res = await app.request("/u-2/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "ticket 42 — cannot upload avatar" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toContain("session=impersonated; Path=/; HttpOnly");
    const event = emitted.find((e) => e.type === EventTypes.ADMIN_IMPERSONATION_STARTED);
    expect(event?.payload.reason).toBe("ticket 42 — cannot upload avatar");
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
    currentSession = { impersonatedBy: null, userId: "admin-1", createdAt: new Date() };
    const res = await app.request("/stop", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 and emits no event when BetterAuth refuses stop", async () => {
    emitted.length = 0;
    currentSession = {
      impersonatedBy: "admin-1",
      userId: "target-2",
      createdAt: new Date(Date.now() - 5_000),
    };
    mockStopImpersonating.mockImplementationOnce(
      async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    );
    const res = await app.request("/stop", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(emitted.some((e) => e.type === EventTypes.ADMIN_IMPERSONATION_STOPPED)).toBe(false);
  });

  it("relays the restore cookie and emits the stop event", async () => {
    emitted.length = 0;
    currentSession = {
      impersonatedBy: "admin-1",
      userId: "target-2",
      createdAt: new Date(Date.now() - 5_000),
    };
    const res = await app.request("/stop", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toContain("session=admin-restored; Path=/; HttpOnly");
    const event = emitted.find((e) => e.type === EventTypes.ADMIN_IMPERSONATION_STOPPED);
    expect(event?.payload.actorUserId).toBe("admin-1");
    expect(event?.payload.userId).toBe("target-2");
    expect(event?.payload.durationMs).toBeGreaterThan(0);
  });
});
