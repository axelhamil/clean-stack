import {
  type AppError,
  AppErrorException,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import { EventTypes, publicNotificationPayload } from "@packages/events";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import type { INotificationStore, NotificationError } from "./application/ports/notification.port";
import {
  MAX_STREAMS_PER_USER,
  type NotificationStreamHub,
} from "./infrastructure/services/notification-stream-hub";
import {
  listQuerySchema,
  markReadSchema,
  orgPreferenceSchema,
  preferenceSchema,
} from "./notifications.schema";

type MarkReadError = NotificationError | AppError<"NOTIFICATION_NOT_FOUND">;

export interface NotificationsRoutesDeps {
  routeGuards: RouteGuards;
  INotificationStore: INotificationStore;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
  NotificationStreamHub: Pick<NotificationStreamHub, "subscribe" | "subscriberCount">;
}

export function createNotificationsRoutes(deps: NotificationsRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, zV("query", listQuerySchema), async (c) => {
      const { cursor, limit } = c.req.valid("query");
      const userId = g.currentUserId(c);
      const result = await deps.INotificationStore.list(userId, Option.fromNullable(cursor), limit);
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
          payload: publicNotificationPayload(n.eventType, n.payload),
        })),
        nextCursor,
      });
    })
    .get("/unread-count", g.requireAuth, async (c) => {
      const userId = g.currentUserId(c);
      const result = await deps.INotificationStore.unreadCount(userId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ count: result.getValue() });
    })
    .post(
      "/read",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", markReadSchema),
      async (c) => {
        const { ids } = c.req.valid("json");
        const userId = g.currentUserId(c);

        const done = await deps.ITransactionService.run(
          async (): Promise<Result<void, MarkReadError>> => {
            const result = await deps.INotificationStore.markRead(userId, ids, new Date());
            if (result.isFailure) return Result.fail(result.getError());
            const marked = result.getValue();

            // An id the caller does not own, or that no longer exists, matches
            // nothing. Answering `200 {ok:true}` claims an action that never
            // happened, and the client decrements its badge by the ids it sent. A
            // 403 would leak the row's existence, so the whole batch is NOT_FOUND
            // and the transaction rolls back: all of it applied, or none of it.
            if (marked.length !== new Set(ids).size) {
              return Result.fail({
                code: "NOTIFICATION_NOT_FOUND",
                message: "One or more notifications were not found.",
              });
            }

            await emitEvent(
              deps.IOutboxRepository,
              EventTypes.NOTIFICATION_READ,
              "notification",
              userId,
              { userId, scope: "selection", count: marked.length, notificationIds: marked },
              {},
            );

            return Result.ok();
          },
        );
        if (done.isFailure) throw new AppErrorException(done.getError());

        return c.json({ ok: true as const });
      },
    )
    .post("/read-all", g.requireAuth, g.requireCurrentPolicies, g.denyImpersonated, async (c) => {
      const userId = g.currentUserId(c);

      const done = await deps.ITransactionService.run(
        async (): Promise<Result<void, NotificationError>> => {
          const result = await deps.INotificationStore.markAllRead(userId, new Date());
          if (result.isFailure) return Result.fail(result.getError());
          const marked = result.getValue();
          // Nothing was unread: no state changed, so there is nothing to observe.
          if (marked.length === 0) return Result.ok();

          await emitEvent(
            deps.IOutboxRepository,
            EventTypes.NOTIFICATION_READ,
            "notification",
            userId,
            { userId, scope: "all", count: marked.length, notificationIds: [] },
            {},
          );

          return Result.ok();
        },
      );
      if (done.isFailure) throw new AppErrorException(done.getError());

      return c.json({ ok: true as const });
    })
    .get("/preferences", g.requireAuth, async (c) => {
      const userId = g.currentUserId(c);
      const result = await deps.INotificationStore.listPreferences("user", userId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ items: result.getValue() });
    })
    .put(
      "/preferences",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", preferenceSchema),
      async (c) => {
        const body = c.req.valid("json");
        const userId = g.currentUserId(c);

        const done = await deps.ITransactionService.run(
          async (): Promise<Result<void, NotificationError>> => {
            const result = await deps.INotificationStore.upsertPreference({
              scope: "user",
              scopeId: userId,
              category: body.category,
              channel: body.channel,
              enabled: body.enabled,
              frequency: body.frequency,
              locked: false,
            });
            if (result.isFailure) return Result.fail(result.getError());

            await emitEvent(
              deps.IOutboxRepository,
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
              {},
            );

            return Result.ok();
          },
        );
        if (done.isFailure) throw new AppErrorException(done.getError());

        return c.json({ ok: true as const });
      },
    )
    .get(
      "/org-preferences",
      g.requireAuth,
      g.requireOrg,
      g.requireOrgPermission({ organization: ["update"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const result = await deps.INotificationStore.listPreferences("org", orgId);
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ items: result.getValue() });
      },
    )
    .put(
      "/org-preferences",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.requireOrg,
      g.requireOrgPermission({ organization: ["update"] }),
      g.denyImpersonated,
      zV("json", orgPreferenceSchema),
      async (c) => {
        const body = c.req.valid("json");
        const userId = g.currentUserId(c);
        const orgId = g.currentOrgId(c);

        const done = await deps.ITransactionService.run(
          async (): Promise<Result<void, NotificationError>> => {
            const result = await deps.INotificationStore.upsertPreference({
              scope: "org",
              scopeId: orgId,
              category: body.category,
              channel: body.channel,
              enabled: body.enabled,
              frequency: body.frequency,
              locked: body.locked,
            });
            if (result.isFailure) return Result.fail(result.getError());

            await emitEvent(
              deps.IOutboxRepository,
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

            return Result.ok();
          },
        );
        if (done.isFailure) throw new AppErrorException(done.getError());

        return c.json({ ok: true as const });
      },
    )
    .get("/stream", g.requireAuth, (c) => {
      const userId = g.currentUserId(c);
      const hub = deps.NotificationStreamHub;

      if (hub.subscriberCount(userId) >= MAX_STREAMS_PER_USER) {
        throw new HTTPException(429, { message: "NOTIFICATION_STREAM_LIMIT" });
      }

      return streamSSE(c, async (stream) => {
        const unsubscribe = hub.subscribe(userId, () => {
          stream.writeSSE({ event: "notification", data: "1" }).catch((err) => {
            c.var.logger.warn({ err }, "notification sse write failed");
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
}
