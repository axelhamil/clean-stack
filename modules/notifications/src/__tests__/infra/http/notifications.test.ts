import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createNotificationsRoutes,
  type NotificationsRoutesDeps,
} from "../../../infra/http/routes/notifications/notifications";

const listNotifications = mockPort<NotificationsRoutesDeps["IListNotificationsQuery"]>();
const unreadCount = mockPort<NotificationsRoutesDeps["IGetUnreadCountQuery"]>();
const listPreferences = mockPort<NotificationsRoutesDeps["IListPreferencesQuery"]>();
const openStream = mockPort<NotificationsRoutesDeps["IOpenNotificationStreamQuery"]>();
const markRead = mockPort<NotificationsRoutesDeps["MarkNotificationsReadUseCase"]>();
const markAllRead = mockPort<NotificationsRoutesDeps["MarkAllNotificationsReadUseCase"]>();
const updatePreference = mockPort<NotificationsRoutesDeps["UpdatePreferenceUseCase"]>();
const updateOrgPreference = mockPort<NotificationsRoutesDeps["UpdateOrgPreferenceUseCase"]>();

const refuse =
  (message: string): RouteGuard =>
  async () => {
    throw new HTTPException(403, { message });
  };

const signedIn = openRouteGuards({ userId: "user-1" });
const inOrg = openRouteGuards({ userId: "user-1", orgId: "org-1" });
const impersonating = { ...inOrg, denyImpersonated: refuse("impersonating") };

interface Call {
  method?: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  guards?: RouteGuards;
}

function send({ method = "GET", path, body, guards = signedIn }: Call) {
  const app = new Hono().route(
    "/notifications",
    createNotificationsRoutes({
      routeGuards: guards,
      IListNotificationsQuery: listNotifications,
      IGetUnreadCountQuery: unreadCount,
      IListPreferencesQuery: listPreferences,
      IOpenNotificationStreamQuery: openStream,
      MarkNotificationsReadUseCase: markRead,
      MarkAllNotificationsReadUseCase: markAllRead,
      UpdatePreferenceUseCase: updatePreference,
      UpdateOrgPreferenceUseCase: updateOrgPreference,
    }),
  );
  app.onError(
    createErrorHandler({
      instrumentation: mockInstrumentation(),
      logger: mockPort<ILogger>(),
      isProduction: false,
    }),
  );

  return app.request(`/notifications${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const PREFERENCE = {
  category: "billing",
  channel: "email",
  enabled: false,
  frequency: "daily",
} as const;

beforeEach(() => {
  for (const port of [markRead, markAllRead, updatePreference, updateOrgPreference]) {
    port.execute.mockReset();
    port.execute.mockResolvedValue(Result.ok());
  }
  listNotifications.execute.mockReset();
  listNotifications.execute.mockResolvedValue(
    Result.ok({
      items: [
        {
          id: "notif-1",
          userId: "user-1",
          organizationId: Option.none(),
          category: "billing",
          eventType: "billing.subscription.created",
          groupKey: Option.none(),
          payload: {},
          readAt: Option.none(),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      nextCursor: Option.some(new Date("2026-01-01T00:00:00.000Z")),
    }),
  );
  openStream.execute.mockReset();
});

describe("reading the feed", () => {
  it("serialises absent values as null and hands back the next cursor", async () => {
    const res = await send({ path: "?limit=1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      items: [{ organizationId: null, groupKey: null, readAt: null }],
      nextCursor: "2026-01-01T00:00:00.000Z",
    });
  });

  it("refuses a cursor that is not a date and a page above 50", async () => {
    expect((await send({ path: "?cursor=yesterday" })).status).toBe(400);
    expect((await send({ path: "?limit=51" })).status).toBe(400);
    expect(listNotifications.execute).not.toHaveBeenCalled();
  });

  it("answers 502 when the feed cannot be read", async () => {
    listNotifications.execute.mockResolvedValue(
      Result.fail({ code: "NOTIFICATION_PROVIDER_FAILURE", message: "db down" }),
    );

    expect((await send({ path: "" })).status).toBe(502);
  });
});

describe("marking notifications read", () => {
  it("marks the caller's notifications", async () => {
    const res = await send({ method: "POST", path: "/read", body: { ids: ["n1"] } });

    expect(res.status).toBe(200);
    expect(markRead.execute.mock.calls[0]?.[0]).toEqual({ userId: "user-1", ids: ["n1"] });
  });

  it("refuses an empty selection", async () => {
    const res = await send({ method: "POST", path: "/read", body: { ids: [] } });

    expect(res.status).toBe(400);
    expect(markRead.execute).not.toHaveBeenCalled();
  });

  it("answers 404 when an id is not the caller's", async () => {
    markRead.execute.mockResolvedValue(
      Result.fail({ code: "NOTIFICATION_NOT_FOUND", message: "not found" }),
    );

    expect((await send({ method: "POST", path: "/read", body: { ids: ["n1"] } })).status).toBe(404);
  });
});

describe("writes under impersonation", () => {
  it.each([
    ["POST", "/read", { ids: ["n1"] }],
    ["POST", "/read-all", undefined],
    ["PUT", "/preferences", PREFERENCE],
    ["PUT", "/org-preferences", { ...PREFERENCE, locked: true }],
  ] as const)("refuses %s %s", async (method, path, body) => {
    const res = await send({ method, path, body, guards: impersonating });

    expect(res.status).toBe(403);
    for (const port of [markRead, markAllRead, updatePreference, updateOrgPreference]) {
      expect(port.execute).not.toHaveBeenCalled();
    }
  });
});

describe("preferences", () => {
  it("saves the caller's preference and refuses an unknown category", async () => {
    expect((await send({ method: "PUT", path: "/preferences", body: PREFERENCE })).status).toBe(
      200,
    );
    expect(updatePreference.execute.mock.calls[0]?.[0]).toEqual({
      ...PREFERENCE,
      userId: "user-1",
    });

    const unknown = await send({
      method: "PUT",
      path: "/preferences",
      body: { ...PREFERENCE, category: "unknown" },
    });
    expect(unknown.status).toBe(400);
  });

  it("saves an org default as the acting admin of the active org", async () => {
    const res = await send({
      method: "PUT",
      path: "/org-preferences",
      body: { ...PREFERENCE, locked: true },
      guards: inOrg,
    });

    expect(res.status).toBe(200);
    expect(updateOrgPreference.execute.mock.calls[0]?.[0]).toEqual({
      ...PREFERENCE,
      locked: true,
      organizationId: "org-1",
      actorUserId: "user-1",
    });
  });

  it("keeps org defaults to members holding organization:update in an active org", async () => {
    const withoutOrg = { ...signedIn, requireOrg: refuse("No active organization") };
    const withoutPermission = {
      ...inOrg,
      requireOrgPermission: () => refuse("Insufficient permission"),
    };

    expect((await send({ path: "/org-preferences", guards: withoutOrg })).status).toBe(403);
    expect((await send({ path: "/org-preferences", guards: withoutPermission })).status).toBe(403);
    expect(listPreferences.execute).not.toHaveBeenCalled();
  });
});

describe("the live stream", () => {
  it("answers 429 NOTIFICATION_STREAM_LIMIT once the user holds too many streams", async () => {
    openStream.execute.mockResolvedValue(
      Result.fail({ code: "NOTIFICATION_STREAM_RATE_LIMITED", message: "too many" }),
    );

    const res = await send({ path: "/stream" });

    expect(res.status).toBe(429);
    expect(await res.text()).toContain("NOTIFICATION_STREAM_LIMIT");
  });
});
