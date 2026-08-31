import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $list = api.notifications.$get;
const $unreadCount = api.notifications["unread-count"].$get;
const $preferences = api.notifications.preferences.$get;
const $orgPreferences = api.notifications["org-preferences"].$get;

export type NotificationsResponse = InferResponseType<typeof $list, 200>;
export type Notification = NotificationsResponse["items"][number];

export type UnreadCountResponse = InferResponseType<typeof $unreadCount, 200>;

export type NotificationPreferencesResponse = InferResponseType<typeof $preferences, 200>;
export type NotificationPreference = NotificationPreferencesResponse["items"][number];

export const notificationsQueryOptions = (cursor?: string) =>
  queryOptions({
    queryKey: ["notifications", "list", cursor ?? null] as const,
    queryFn: async ({ signal }) => {
      const res = await $list({ query: cursor ? { cursor } : {} }, { init: { signal } });
      if (!res.ok) {
        await throwApiError(
          res,
          getErrorsT()("fallback.loadNotifications", {
            defaultValue: "Failed to load notifications",
          }),
        );
      }
      return (await res.json()) as NotificationsResponse;
    },
  });

export const unreadCountQueryOptions = queryOptions({
  queryKey: ["notifications", "unread-count"] as const,
  queryFn: async ({ signal }) => {
    const res = await $unreadCount({}, { init: { signal } });
    if (!res.ok) {
      await throwApiError(
        res,
        getErrorsT()("fallback.loadUnreadCount", { defaultValue: "Failed to load unread count" }),
      );
    }
    return (await res.json()) as UnreadCountResponse;
  },
});

export const notificationPreferencesQueryOptions = queryOptions({
  queryKey: ["notifications", "preferences"] as const,
  queryFn: async ({ signal }) => {
    const res = await $preferences({}, { init: { signal } });
    if (!res.ok) {
      await throwApiError(
        res,
        getErrorsT()("fallback.loadNotificationPreferences", {
          defaultValue: "Failed to load notification preferences",
        }),
      );
    }
    return (await res.json()) as NotificationPreferencesResponse;
  },
});

export const orgNotificationPreferencesQueryOptions = queryOptions({
  queryKey: ["notifications", "org-preferences"] as const,
  queryFn: async ({ signal }) => {
    const res = await $orgPreferences({}, { init: { signal } });
    if (!res.ok) {
      await throwApiError(
        res,
        getErrorsT()("fallback.loadOrgNotificationPreferences", {
          defaultValue: "Failed to load org notification preferences",
        }),
      );
    }
    return (await res.json()) as NotificationPreferencesResponse;
  },
});
