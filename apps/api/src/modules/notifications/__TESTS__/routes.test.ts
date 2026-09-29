import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type {
  NotificationError,
  NotificationRecord,
  PreferenceRecord,
} from "../application/ports/notification.port";
import { listQuerySchema, markReadSchema, preferenceSchema } from "../notifications.schema";

// ── Schema tests ───────────────────────────────────────────────────────────

describe("notification schemas", () => {
  it("defaults limit to 20 and caps it at 50", () => {
    expect(listQuerySchema.parse({}).limit).toBe(20);
    expect(listQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("markRead rejects an empty array", () => {
    expect(markReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("preference rejects an unknown category", () => {
    expect(
      preferenceSchema.safeParse({ category: "unknown", channel: "email", enabled: true }).success,
    ).toBe(false);
  });
});

// ── Route tests ────────────────────────────────────────────────────────────

const NOTIFICATION: NotificationRecord = {
  id: "notif-1",
  userId: "user-1",
  organizationId: Option.none(),
  category: "billing",
  eventType: "billing.subscription.created",
  groupKey: Option.none(),
  payload: {},
  readAt: Option.none(),
  createdAt: new Date("2024-01-01"),
};

const PREFERENCE: PreferenceRecord = {
  scope: "user",
  scopeId: "user-1",
  category: "billing",
  channel: "email",
  enabled: true,
  frequency: "immediate",
  locked: false,
};

const mockList = mock(
  async (): Promise<Result<NotificationRecord[], NotificationError>> => Result.ok([NOTIFICATION]),
);
const mockUnreadCount = mock(async (): Promise<Result<number, NotificationError>> => Result.ok(3));
const mockMarkRead = mock(
  async (
    _userId: string,
    _ids: string[],
    _now: Date,
    _tx?: unknown,
  ): Promise<Result<string[], NotificationError>> => Result.ok(["notif-1"]),
);
const mockMarkAllRead = mock(
  async (): Promise<Result<string[], NotificationError>> => Result.ok(["notif-1"]),
);
const mockListPreferences = mock(
  async (): Promise<Result<PreferenceRecord[], NotificationError>> => Result.ok([PREFERENCE]),
);
// The parameters are declared: without them `mock.calls` is typed `[]` and
// the assertions on the transaction handle do not compile.
const mockUpsertPreference = mock(
  async (_input: unknown, _tx?: unknown): Promise<Result<void, NotificationError>> => Result.ok(),
);

const mockEnqueue = mock(async (_events: unknown, _meta: unknown, _tx?: unknown) => {});

const TX = { sentinel: "transaction" };

mock.module("../../../container", () => ({
  di: {
    INotificationStore: {
      list: mockList,
      unreadCount: mockUnreadCount,
      markRead: mockMarkRead,
      markAllRead: mockMarkAllRead,
      listPreferences: mockListPreferences,
      upsertPreference: mockUpsertPreference,
    },
    IOutboxRepository: {
      enqueue: mockEnqueue,
    },
    ITransactionService: {
      run: async (callback: (tx: unknown) => Promise<unknown>) => callback(TX),
    },
    PolicyAcceptanceService: {
      hasAcceptedCurrent: mock(async () => Result.ok(true)),
    },
  },
}));

let currentSession: Record<string, unknown> = {};
let allowOrgPermission = true;

mock.module("../../../shared/middleware/auth.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", currentSession);
    await next();
  },
  AuthVariables: {},
}));

mock.module("../../../shared/middleware/org.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireOrg: async (c: any, next: () => Promise<void>) => {
    const orgId = (c.get("session") as Record<string, unknown>)?.activeOrganizationId;
    if (!orgId) {
      const { HTTPException } = await import("hono/http-exception");
      throw new HTTPException(403, { message: "No active organization" });
    }
    c.set("orgId", orgId);
    await next();
  },
  requireOrgPermission: () => async (_c: unknown, next: () => Promise<void>) => {
    if (!allowOrgPermission) {
      const { HTTPException } = await import("hono/http-exception");
      throw new HTTPException(403, { message: "Insufficient permission" });
    }
    await next();
  },
}));

const { notificationsRoutes } = await import("../routes");
const { Hono } = await import("hono");
const { createErrorHandler } = await import("../../../shared/middleware/error.middleware");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/notifications", notificationsRoutes);
  return app;
}

describe("GET /notifications - list", () => {
  it("returns items with Options serialised as null", async () => {
    currentSession = {};
    const app = makeApp();
    const res = await app.request("/notifications");
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const body = (await res.json()) as any;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0].organizationId).toBeNull();
    expect(body.items[0].groupKey).toBeNull();
    expect(body.items[0].readAt).toBeNull();
  });
});

describe("GET /notifications/unread-count", () => {
  it("returns the unread count", async () => {
    currentSession = {};
    const app = makeApp();
    const res = await app.request("/notifications/unread-count");
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const body = (await res.json()) as any;
    expect(body.count).toBe(3);
  });
});

describe("POST /notifications/read - mark-read", () => {
  it("returns ok when the ids are valid", async () => {
    currentSession = {};
    mockMarkRead.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["notif-1"] }),
    });
    expect(res.status).toBe(200);
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
  });

  it("rejects an impersonated session (403)", async () => {
    currentSession = { impersonatedBy: "admin-99" };
    mockMarkRead.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["notif-1"] }),
    });
    expect(res.status).toBe(403);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it("rejects an empty array (400)", async () => {
    currentSession = {};
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /notifications/read - domain event", () => {
  it("emits notification.read in the same transaction", async () => {
    currentSession = {};
    mockMarkRead.mockClear();
    mockEnqueue.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["notif-1"] }),
    });

    expect(res.status).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const [events, , tx] = (mockEnqueue.mock.calls[0] ?? []) as any[];
    expect(events[0].eventType).toBe("notification.read");
    expect(events[0].payload).toEqual({
      userId: "user-1",
      scope: "selection",
      count: 1,
      notificationIds: ["notif-1"],
    });
    expect(tx).toBe(TX);
    expect(mockMarkRead.mock.calls[0]?.[3]).toBe(TX);
  });

  it("answers 404 and emits nothing for someone else's notification", async () => {
    currentSession = {};
    mockEnqueue.mockClear();
    mockMarkRead.mockImplementationOnce(async () => Result.ok([]));
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["notif-foreign"] }),
    });

    expect(res.status).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("refuses the whole batch when a single id is foreign", async () => {
    currentSession = {};
    mockEnqueue.mockClear();
    mockMarkRead.mockImplementationOnce(async () => Result.ok(["notif-1"]));
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["notif-1", "notif-foreign"] }),
    });

    expect(res.status).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("tolerates a repeated id in the request body", async () => {
    currentSession = {};
    mockEnqueue.mockClear();
    mockMarkRead.mockImplementationOnce(async () => Result.ok(["notif-1"]));
    const app = makeApp();
    const res = await app.request("/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["notif-1", "notif-1"] }),
    });

    expect(res.status).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("read-all reports a count without copying unbounded ids", async () => {
    currentSession = {};
    mockEnqueue.mockClear();
    mockMarkAllRead.mockImplementationOnce(async () => Result.ok(["a", "b", "c"]));
    const app = makeApp();
    await app.request("/notifications/read-all", { method: "POST" });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const [events] = (mockEnqueue.mock.calls[0] ?? []) as any[];
    expect(events[0].payload).toEqual({
      userId: "user-1",
      scope: "all",
      count: 3,
      notificationIds: [],
    });
  });
});

describe("POST /notifications/read-all", () => {
  it("rejects an impersonated session (403)", async () => {
    currentSession = { impersonatedBy: "admin-99" };
    mockMarkAllRead.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(403);
    expect(mockMarkAllRead).not.toHaveBeenCalled();
  });

  it("returns ok for a regular session", async () => {
    currentSession = {};
    const app = makeApp();
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("GET /notifications/preferences", () => {
  it("returns the user preferences", async () => {
    currentSession = {};
    const app = makeApp();
    const res = await app.request("/notifications/preferences");
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const body = (await res.json()) as any;
    expect(Array.isArray(body.items)).toBe(true);
  });
});

describe("PUT /notifications/preferences", () => {
  it("saves the preference and returns ok", async () => {
    currentSession = {};
    mockUpsertPreference.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "billing", channel: "email", enabled: false }),
    });
    expect(res.status).toBe(200);
    expect(mockUpsertPreference).toHaveBeenCalledTimes(1);
  });

  it("writes the preference and emits the event in the same transaction", async () => {
    currentSession = {};
    mockUpsertPreference.mockClear();
    mockEnqueue.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "billing", channel: "email", enabled: false }),
    });
    expect(res.status).toBe(200);
    // A call count proves nothing: both writes could just as well run outside
    // the transaction. What matters is that they carry the SAME handle,
    // otherwise a crash between them would leave a changed preference with no
    // event, hence no audit trail.
    expect(mockUpsertPreference.mock.calls[0]?.[1]).toBe(TX);
    expect(mockEnqueue.mock.calls[0]?.[2]).toBe(TX);
  });

  it("rejects an impersonated session (403)", async () => {
    currentSession = { impersonatedBy: "admin-99" };
    const app = makeApp();
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "billing", channel: "email", enabled: false }),
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /notifications/org-preferences", () => {
  it("requires an active org (403 without one)", async () => {
    currentSession = {};
    allowOrgPermission = true;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(403);
  });

  it("rejects a member without the organization:update capability (403)", async () => {
    currentSession = { activeOrganizationId: "org-1" };
    allowOrgPermission = false;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(403);
    allowOrgPermission = true;
  });

  it("returns the org preferences when the capability is present", async () => {
    currentSession = { activeOrganizationId: "org-1" };
    allowOrgPermission = true;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion
    const body = (await res.json()) as any;
    expect(Array.isArray(body.items)).toBe(true);
  });
});

describe("PUT /notifications/org-preferences", () => {
  it("saves the org preference and returns ok", async () => {
    currentSession = { activeOrganizationId: "org-1" };
    mockUpsertPreference.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "security",
        channel: "in_app",
        enabled: true,
        locked: true,
      }),
    });
    expect(res.status).toBe(200);
    expect(mockUpsertPreference).toHaveBeenCalledTimes(1);
  });

  it("writes the org preference and emits the event in the same transaction", async () => {
    currentSession = { activeOrganizationId: "org-1" };
    mockUpsertPreference.mockClear();
    mockEnqueue.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "security",
        channel: "in_app",
        enabled: true,
        locked: true,
      }),
    });
    expect(res.status).toBe(200);
    // Same reason as on the user side: an org lock is a compliance event, and
    // a locked preference without an event is an audit gap nothing can
    // recover afterwards.
    expect(mockUpsertPreference.mock.calls[0]?.[1]).toBe(TX);
    expect(mockEnqueue.mock.calls[0]?.[2]).toBe(TX);
  });

  it("rejects an impersonated session (403)", async () => {
    currentSession = { activeOrganizationId: "org-1", impersonatedBy: "admin-99" };
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "security",
        channel: "in_app",
        enabled: true,
        locked: true,
      }),
    });
    expect(res.status).toBe(403);
  });
});
