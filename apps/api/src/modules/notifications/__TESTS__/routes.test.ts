import { describe, expect, it, mock } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import type { RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  NotificationError,
  NotificationRecord,
  PreferenceRecord,
} from "../application/ports/notification.port";
import { listQuerySchema, markReadSchema, preferenceSchema } from "../notifications.schema";
import { createNotificationsRoutes, type NotificationsRoutesDeps } from "../routes";

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
const storeTransactions: unknown[] = [];
const mockMarkRead = mock(async (): Promise<Result<string[], NotificationError>> => {
  storeTransactions.push(UnitOfWorkContext.transaction());
  return Result.ok(["notif-1"]);
});
const mockMarkAllRead = mock(
  async (): Promise<Result<string[], NotificationError>> => Result.ok(["notif-1"]),
);
const mockListPreferences = mock(
  async (): Promise<Result<PreferenceRecord[], NotificationError>> => Result.ok([PREFERENCE]),
);
const mockUpsertPreference = mock(async (): Promise<Result<void, NotificationError>> => {
  storeTransactions.push(UnitOfWorkContext.transaction());
  return Result.ok();
});

const enqueueTransactions: unknown[] = [];
const mockEnqueue = mock(async (_events: unknown, _meta: unknown) => {
  enqueueTransactions.push(UnitOfWorkContext.transaction());
});

const { unitOfWork, outcome } = mockUnitOfWork();

const deps: Omit<NotificationsRoutesDeps, "routeGuards"> = {
  INotificationStore: {
    list: mockList,
    unreadCount: mockUnreadCount,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
    listPreferences: mockListPreferences,
    upsertPreference: mockUpsertPreference,
  },
  IOutboxRepository: {
    ...mockPort<NotificationsRoutesDeps["IOutboxRepository"]>(),
    enqueue: mockEnqueue,
  },
  ITransactionService: unitOfWork,
  NotificationStreamHub: mockPort<NotificationsRoutesDeps["NotificationStreamHub"]>(),
};

const refuse =
  (message: string): RouteGuard =>
  async () => {
    throw new HTTPException(403, { message });
  };

const signedIn = openRouteGuards({ userId: "user-1" });
const inOrg = openRouteGuards({ userId: "user-1", orgId: "org-1" });
const impersonating = { ...signedIn, denyImpersonated: refuse("impersonating") };
const withoutOrg = { ...signedIn, requireOrg: refuse("No active organization") };
const withoutOrgPermission = {
  ...inOrg,
  requireOrgPermission: () => refuse("Insufficient permission"),
};

async function lastRunSettlement() {
  const [settled] = await Promise.allSettled([unitOfWork.run.mock.results.at(-1)?.value]);

  return settled?.status;
}

let guards: RouteGuards = signedIn;

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/notifications", createNotificationsRoutes({ ...deps, routeGuards: guards }));
  return app;
}

describe("GET /notifications - list", () => {
  it("returns items with Options serialised as null", async () => {
    guards = signedIn;
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
    guards = signedIn;
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
    guards = signedIn;
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
    guards = impersonating;
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
    guards = signedIn;
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
    guards = signedIn;
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
    const [events] = (mockEnqueue.mock.calls[0] ?? []) as any[];
    const tx = enqueueTransactions.at(-1);
    expect(events[0].eventType).toBe("notification.read");
    expect(events[0].payload).toEqual({
      userId: "user-1",
      scope: "selection",
      count: 1,
      notificationIds: ["notif-1"],
    });
    expect(tx).toBeDefined();
    expect(tx).toBe(storeTransactions.at(-1));
  });

  it("answers 404 and emits nothing for someone else's notification", async () => {
    guards = signedIn;
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
    guards = signedIn;
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
    guards = signedIn;
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
    guards = signedIn;
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
    guards = impersonating;
    mockMarkAllRead.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(403);
    expect(mockMarkAllRead).not.toHaveBeenCalled();
  });

  it("returns ok for a regular session", async () => {
    guards = signedIn;
    const app = makeApp();
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("GET /notifications/preferences", () => {
  it("returns the user preferences", async () => {
    guards = signedIn;
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
    guards = signedIn;
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
    guards = signedIn;
    mockUpsertPreference.mockClear();
    mockEnqueue.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "billing", channel: "email", enabled: false }),
    });
    expect(res.status).toBe(200);
    expect(enqueueTransactions.at(-1)).toBeDefined();
    expect(enqueueTransactions.at(-1)).toBe(storeTransactions.at(-1));
  });

  it("rejects an impersonated session (403)", async () => {
    guards = impersonating;
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
    guards = withoutOrg;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(403);
  });

  it("rejects a member without the organization:update capability (403)", async () => {
    guards = withoutOrgPermission;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(403);
  });

  it("returns the org preferences when the capability is present", async () => {
    guards = inOrg;
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
    guards = inOrg;
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
    guards = inOrg;
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
    expect(enqueueTransactions.at(-1)).toBeDefined();
    expect(enqueueTransactions.at(-1)).toBe(storeTransactions.at(-1));
  });

  it("rejects an impersonated session (403)", async () => {
    guards = { ...inOrg, denyImpersonated: refuse("impersonating") };
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

describe("write routes - a failure rolls the unit back by returning it", () => {
  const STORE_DOWN: NotificationError = {
    code: "NOTIFICATION_WRITE_PROVIDER_FAILURE",
    message: "db down",
  };

  function jsonRequest(path: string, method: string, body: unknown) {
    return makeApp().request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("mark-read answers NOTIFICATION_NOT_FOUND for a foreign id", async () => {
    guards = signedIn;
    mockMarkRead.mockImplementationOnce(async () => Result.ok([]));

    const res = await jsonRequest("/notifications/read", "POST", { ids: ["notif-foreign"] });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ error: { code: "NOTIFICATION_NOT_FOUND" } });
    expect(outcome()).toBe("rolled_back");
    expect(await lastRunSettlement()).toBe("fulfilled");
  });

  it("mark-read surfaces a store failure", async () => {
    guards = signedIn;
    mockMarkRead.mockImplementationOnce(async () => Result.fail(STORE_DOWN));

    const res = await jsonRequest("/notifications/read", "POST", { ids: ["notif-1"] });

    expect(res.status).toBe(502);
    expect(outcome()).toBe("rolled_back");
    expect(await lastRunSettlement()).toBe("fulfilled");
  });

  it("read-all surfaces a store failure", async () => {
    guards = signedIn;
    mockMarkAllRead.mockImplementationOnce(async () => Result.fail(STORE_DOWN));

    const res = await makeApp().request("/notifications/read-all", { method: "POST" });

    expect(res.status).toBe(502);
    expect(outcome()).toBe("rolled_back");
    expect(await lastRunSettlement()).toBe("fulfilled");
  });

  it("preferences surfaces a store failure", async () => {
    guards = signedIn;
    mockUpsertPreference.mockImplementationOnce(async () => Result.fail(STORE_DOWN));

    const res = await jsonRequest("/notifications/preferences", "PUT", {
      category: "billing",
      channel: "email",
      enabled: false,
    });

    expect(res.status).toBe(502);
    expect(outcome()).toBe("rolled_back");
    expect(await lastRunSettlement()).toBe("fulfilled");
  });

  it("org-preferences surfaces a store failure", async () => {
    guards = inOrg;
    mockUpsertPreference.mockImplementationOnce(async () => Result.fail(STORE_DOWN));

    const res = await jsonRequest("/notifications/org-preferences", "PUT", {
      category: "security",
      channel: "in_app",
      enabled: true,
      locked: true,
    });

    expect(res.status).toBe(502);
    expect(outcome()).toBe("rolled_back");
    expect(await lastRunSettlement()).toBe("fulfilled");
  });
});
