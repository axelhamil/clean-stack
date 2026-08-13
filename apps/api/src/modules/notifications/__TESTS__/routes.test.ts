import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type {
  NotificationError,
  NotificationRecord,
  PreferenceRecord,
} from "../application/ports/notification.port";
import { listQuerySchema, markReadSchema, preferenceSchema } from "../notifications.schema";

// ── Schema tests ───────────────────────────────────────────────────────────

describe("schemas de notification", () => {
  it("limit par defaut a 20 et plafonne a 50", () => {
    expect(listQuerySchema.parse({}).limit).toBe(20);
    expect(listQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("markRead refuse un tableau vide", () => {
    expect(markReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("preference refuse une categorie inconnue", () => {
    expect(
      preferenceSchema.safeParse({ category: "inexistante", channel: "email", enabled: true })
        .success,
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
const mockMarkRead = mock(async (): Promise<Result<void, NotificationError>> => Result.ok());
const mockMarkAllRead = mock(async (): Promise<Result<void, NotificationError>> => Result.ok());
const mockListPreferences = mock(
  async (): Promise<Result<PreferenceRecord[], NotificationError>> => Result.ok([PREFERENCE]),
);
const mockUpsertPreference = mock(
  async (): Promise<Result<void, NotificationError>> => Result.ok(),
);

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
  it("renvoie les items avec les Options serialises en null", async () => {
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
  it("renvoie le compte des non lues", async () => {
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
  it("retourne ok quand les ids sont valides", async () => {
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

  it("rejette une session impersonnifiee (403)", async () => {
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

  it("rejette un tableau vide (400)", async () => {
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

describe("POST /notifications/read-all", () => {
  it("rejette une session impersonnifiee (403)", async () => {
    currentSession = { impersonatedBy: "admin-99" };
    mockMarkAllRead.mockClear();
    const app = makeApp();
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(403);
    expect(mockMarkAllRead).not.toHaveBeenCalled();
  });

  it("retourne ok pour une session normale", async () => {
    currentSession = {};
    const app = makeApp();
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("GET /notifications/preferences", () => {
  it("renvoie les preferences utilisateur", async () => {
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
  it("sauvegarde la preference et retourne ok", async () => {
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

  it("rejette une session impersonnifiee (403)", async () => {
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
  it("exige un org actif (403 sans org)", async () => {
    currentSession = {};
    allowOrgPermission = true;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(403);
  });

  it("rejette un membre sans la capability organization:update (403)", async () => {
    currentSession = { activeOrganizationId: "org-1" };
    allowOrgPermission = false;
    const app = makeApp();
    const res = await app.request("/notifications/org-preferences");
    expect(res.status).toBe(403);
    allowOrgPermission = true;
  });

  it("renvoie les preferences org quand la capability est presente", async () => {
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
  it("sauvegarde la preference org et retourne ok", async () => {
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

  it("rejette une session impersonnifiee (403)", async () => {
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
