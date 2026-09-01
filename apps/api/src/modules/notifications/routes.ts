import { AppErrorException, Option } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { di } from "../../container";
import { emitEvent } from "../../shared/event-emitter";
import { logger } from "../../shared/logger";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
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
    const notifications = result.getValue();
    const lastItem = notifications.at(-1);
    const nextCursor =
      notifications.length === limit && lastItem ? lastItem.createdAt.toISOString() : null;
    return c.json({
      items: notifications.map((n) => ({
        ...n,
        organizationId: n.organizationId.toNull(),
        groupKey: n.groupKey.toNull(),
        readAt: n.readAt.toNull(),
      })),
      nextCursor,
    });
  })
  .get("/unread-count", requireAuth, async (c) => {
    const userId = c.get("user").id;
    const result = await di.INotificationStore.unreadCount(userId);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ count: result.getValue() });
  })
  .post(
    "/read",
    requireAuth,
    requireCurrentPolicies,
    denyImpersonated,
    zV("json", markReadSchema),
    async (c) => {
      const { ids } = c.req.valid("json");
      const userId = c.get("user").id;

      await di.ITransactionService.run(async (tx) => {
        const result = await di.INotificationStore.markRead(userId, ids, new Date(), tx);
        if (result.isFailure) throw new AppErrorException(result.getError());
        const marked = result.getValue();
        // Nothing matched: no state changed, so there is nothing to observe.
        if (marked.length === 0) return;

        await emitEvent(
          di.IOutboxRepository,
          EventTypes.NOTIFICATION_READ,
          "notification",
          userId,
          { userId, scope: "selection", count: marked.length, notificationIds: marked },
          {},
          tx,
        );
      });

      return c.json({ ok: true as const });
    },
  )
  .post("/read-all", requireAuth, requireCurrentPolicies, denyImpersonated, async (c) => {
    const userId = c.get("user").id;

    await di.ITransactionService.run(async (tx) => {
      const result = await di.INotificationStore.markAllRead(userId, new Date(), tx);
      if (result.isFailure) throw new AppErrorException(result.getError());
      const marked = result.getValue();
      // Nothing was unread: no state changed, so there is nothing to observe.
      if (marked.length === 0) return;

      await emitEvent(
        di.IOutboxRepository,
        EventTypes.NOTIFICATION_READ,
        "notification",
        userId,
        { userId, scope: "all", count: marked.length, notificationIds: [] },
        {},
        tx,
      );
    });

    return c.json({ ok: true as const });
  })
  .get("/preferences", requireAuth, async (c) => {
    const userId = c.get("user").id;
    const result = await di.INotificationStore.listPreferences("user", userId);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ items: result.getValue() });
  })
  .put(
    "/preferences",
    requireAuth,
    requireCurrentPolicies,
    denyImpersonated,
    zV("json", preferenceSchema),
    async (c) => {
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
      await emitEvent(
        di.IOutboxRepository,
        EventTypes.NOTIFICATION_PREFERENCE_UPDATED,
        "notification_preference",
        userId,
        {
          userId,
          category: body.category,
          channel: body.channel,
          enabled: body.enabled,
          frequency: body.frequency,
        },
      );
      return c.json({ ok: true as const });
    },
  )
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
    requireCurrentPolicies,
    requireOrg,
    requireOrgPermission({ organization: ["update"] }),
    denyImpersonated,
    zV("json", orgPreferenceSchema),
    async (c) => {
      const body = c.req.valid("json");
      const userId = c.get("user").id;
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
      await emitEvent(
        di.IOutboxRepository,
        EventTypes.NOTIFICATION_ORG_PREFERENCE_UPDATED,
        "notification_preference",
        orgId,
        {
          organizationId: orgId,
          actorUserId: userId,
          category: body.category,
          channel: body.channel,
          enabled: body.enabled,
          frequency: body.frequency,
          locked: body.locked,
        },
        { organizationId: orgId },
      );
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
        stream.writeSSE({ event: "notification", data: "1" }).catch((err) => {
          logger.warn({ err }, "notification sse write failed");
        });
      });

      stream.onAbort(unsubscribe);

      try {
        while (!stream.closed) {
          await stream.writeSSE({ event: "ping", data: "" });
          await stream.sleep(25_000);
        }
      } finally {
        unsubscribe();
      }
    });
  });
