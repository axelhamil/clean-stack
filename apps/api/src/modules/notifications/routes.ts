import { AppErrorException, Option } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { MAX_STREAMS_PER_USER } from "../../shared/services/notification-stream-hub";
import { zV } from "../../shared/validator";
import {
  listQuerySchema,
  markReadSchema,
  orgPreferenceSchema,
  preferenceSchema,
} from "./notifications.schema";

export const notificationsRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/", requireAuth, zV("query", listQuerySchema), async (c) => {
    const { cursor, limit } = c.req.valid("query");
    const userId = c.get("user").id;
    const result = await di.INotificationStore.list(
      userId,
      Option.fromNullable(cursor ?? null),
      limit,
    );
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({
      items: result.getValue().map((n) => ({
        ...n,
        organizationId: n.organizationId.toNull(),
        groupKey: n.groupKey.toNull(),
        readAt: n.readAt.toNull(),
      })),
    });
  })
  .get("/unread-count", requireAuth, async (c) => {
    const userId = c.get("user").id;
    const result = await di.INotificationStore.unreadCount(userId);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ count: result.getValue() });
  })
  .post("/read", requireAuth, denyImpersonated, zV("json", markReadSchema), async (c) => {
    const { ids } = c.req.valid("json");
    const userId = c.get("user").id;
    const result = await di.INotificationStore.markRead(userId, ids, new Date());
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true as const });
  })
  .post("/read-all", requireAuth, denyImpersonated, async (c) => {
    const userId = c.get("user").id;
    const result = await di.INotificationStore.markAllRead(userId, new Date());
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true as const });
  })
  .get("/preferences", requireAuth, async (c) => {
    const userId = c.get("user").id;
    const result = await di.INotificationStore.listPreferences("user", userId);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ items: result.getValue() });
  })
  .put("/preferences", requireAuth, denyImpersonated, zV("json", preferenceSchema), async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("user").id;
    const result = await di.INotificationStore.upsertPreference({
      scope: "user",
      scopeId: userId,
      category: body.category,
      channel: body.channel,
      enabled: body.enabled,
      frequency: body.frequency,
      locked: false,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true as const });
  })
  .get(
    "/org-preferences",
    requireAuth,
    requireOrg,
    requireOrgPermission({ organization: ["update"] }),
    async (c) => {
      const orgId = c.get("orgId");
      const result = await di.INotificationStore.listPreferences("org", orgId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ items: result.getValue() });
    },
  )
  .put(
    "/org-preferences",
    requireAuth,
    requireOrg,
    requireOrgPermission({ organization: ["update"] }),
    denyImpersonated,
    zV("json", orgPreferenceSchema),
    async (c) => {
      const body = c.req.valid("json");
      const orgId = c.get("orgId");
      const result = await di.INotificationStore.upsertPreference({
        scope: "org",
        scopeId: orgId,
        category: body.category,
        channel: body.channel,
        enabled: body.enabled,
        frequency: body.frequency,
        locked: body.locked,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ ok: true as const });
    },
  )
  .get("/stream", requireAuth, (c) => {
    const userId = c.get("user").id;
    const hub = di.NotificationStreamHub;

    if (hub.subscriberCount(userId) >= MAX_STREAMS_PER_USER) {
      throw new HTTPException(429, { message: "NOTIFICATION_STREAM_LIMIT" });
    }

    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe(userId, () => {
        void stream.writeSSE({ event: "notification", data: "1" });
      });

      stream.onAbort(unsubscribe);

      while (!stream.closed) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(25_000);
      }
      unsubscribe();
    });
  });
