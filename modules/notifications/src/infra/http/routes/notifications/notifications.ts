import { AppErrorException, type IUseCase, Option } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import type { NotificationError } from "../../../../application/ports/repositories/notification.port";
import type { IGetUnreadCountQuery } from "../../../../application/queries/get-unread-count.query";
import type { IListNotificationsQuery } from "../../../../application/queries/list-notifications.query";
import type { IListPreferencesQuery } from "../../../../application/queries/list-preferences.query";
import type { IOpenNotificationStreamQuery } from "../../../../application/queries/open-notification-stream.query";
import type { MarkAllNotificationsReadInput } from "../../../../application/usecases/mark-all-notifications-read/mark-all-notifications-read.dto";
import type {
  MarkNotificationsReadError,
  MarkNotificationsReadInput,
} from "../../../../application/usecases/mark-notifications-read/mark-notifications-read.dto";
import type { UpdateOrgPreferenceInput } from "../../../../application/usecases/update-org-preference/update-org-preference.dto";
import type { UpdatePreferenceInput } from "../../../../application/usecases/update-preference/update-preference.dto";
import { toNotificationPageJson } from "./notifications.presenter";
import {
  listQuerySchema,
  markReadSchema,
  orgPreferenceSchema,
  preferenceSchema,
} from "./notifications.schema";

export interface NotificationsRoutesDeps {
  routeGuards: RouteGuards;
  IListNotificationsQuery: IListNotificationsQuery;
  IGetUnreadCountQuery: IGetUnreadCountQuery;
  IListPreferencesQuery: IListPreferencesQuery;
  IOpenNotificationStreamQuery: IOpenNotificationStreamQuery;
  MarkNotificationsReadUseCase: IUseCase<
    MarkNotificationsReadInput,
    void,
    MarkNotificationsReadError
  >;
  MarkAllNotificationsReadUseCase: IUseCase<MarkAllNotificationsReadInput, void, NotificationError>;
  UpdatePreferenceUseCase: IUseCase<UpdatePreferenceInput, void, NotificationError>;
  UpdateOrgPreferenceUseCase: IUseCase<UpdateOrgPreferenceInput, void, NotificationError>;
}

export function createNotificationsRoutes(deps: NotificationsRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, zV("query", listQuerySchema), async (c) => {
      const { cursor, limit } = c.req.valid("query");
      const result = await deps.IListNotificationsQuery.execute({
        userId: g.currentUserId(c),
        cursor: Option.fromNullable(cursor),
        limit,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(toNotificationPageJson(result.getValue()));
    })
    .get("/unread-count", g.requireAuth, async (c) => {
      const result = await deps.IGetUnreadCountQuery.execute({ userId: g.currentUserId(c) });
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
        const done = await deps.MarkNotificationsReadUseCase.execute({
          userId: g.currentUserId(c),
          ids: c.req.valid("json").ids,
        });
        if (done.isFailure) throw new AppErrorException(done.getError());

        return c.json({ ok: true as const });
      },
    )
    .post("/read-all", g.requireAuth, g.requireCurrentPolicies, g.denyImpersonated, async (c) => {
      const done = await deps.MarkAllNotificationsReadUseCase.execute({
        userId: g.currentUserId(c),
      });
      if (done.isFailure) throw new AppErrorException(done.getError());

      return c.json({ ok: true as const });
    })
    .get("/preferences", g.requireAuth, async (c) => {
      const result = await deps.IListPreferencesQuery.execute({
        scope: "user",
        scopeId: g.currentUserId(c),
      });
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
        const done = await deps.UpdatePreferenceUseCase.execute({
          ...c.req.valid("json"),
          userId: g.currentUserId(c),
        });
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
        const result = await deps.IListPreferencesQuery.execute({
          scope: "org",
          scopeId: g.currentOrgId(c),
        });
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
        const done = await deps.UpdateOrgPreferenceUseCase.execute({
          ...c.req.valid("json"),
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
        });
        if (done.isFailure) throw new AppErrorException(done.getError());

        return c.json({ ok: true as const });
      },
    )
    .get("/stream", g.requireAuth, async (c) => {
      const opened = await deps.IOpenNotificationStreamQuery.execute({
        userId: g.currentUserId(c),
      });
      if (opened.isFailure) throw new HTTPException(429, { message: "NOTIFICATION_STREAM_LIMIT" });

      const notifications = opened.getValue();

      return streamSSE(c, async (stream) => {
        const unsubscribe = notifications.subscribe(() => {
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
