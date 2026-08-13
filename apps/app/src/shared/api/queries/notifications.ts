import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $list = api.notifications.$get;
const $unreadCount = api.notifications["unread-count"].$get;

export type NotificationsResponse = InferResponseType<typeof $list, 200>;
export type Notification = NotificationsResponse["items"][number];

export type UnreadCountResponse = InferResponseType<typeof $unreadCount, 200>;

// Preference types are defined explicitly because the server's port types
// (NotificationChannel, NotificationFrequency, PreferenceScope) are private
// to the api module and cannot be referenced portably from the front (TS2883).
export type NotificationPreference = {
  scope: "user" | "org";
  scopeId: string;
  category: string;
  channel: "in_app" | "email";
  enabled: boolean;
  frequency: "immediate" | "hourly" | "daily";
  locked: boolean;
};

export type NotificationPreferencesResponse = { items: NotificationPreference[] };

export const notificationsQueryOptions = (cursor?: string) =>
  queryOptions({
    queryKey: ["notifications", "list", cursor ?? null] as const,
    queryFn: async ({ signal }) => {
      const res = await $list({ query: cursor ? { cursor } : {} }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "Failed to load notifications");
      return (await res.json()) as NotificationsResponse;
    },
  });

export const unreadCountQueryOptions = queryOptions({
  queryKey: ["notifications", "unread-count"] as const,
  queryFn: async ({ signal }) => {
    const res = await $unreadCount({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "Failed to load unread count");
    return (await res.json()) as UnreadCountResponse;
  },
});

export const notificationPreferencesQueryOptions = queryOptions({
  queryKey: ["notifications", "preferences"] as const,
  queryFn: async ({ signal }): Promise<NotificationPreferencesResponse> => {
    const res = await api.notifications.preferences.$get({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "Failed to load notification preferences");
    return res.json() as Promise<NotificationPreferencesResponse>;
  },
});

export const orgNotificationPreferencesQueryOptions = queryOptions({
  queryKey: ["notifications", "org-preferences"] as const,
  queryFn: async ({ signal }): Promise<NotificationPreferencesResponse> => {
    const res = await api.notifications["org-preferences"].$get({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "Failed to load org notification preferences");
    return res.json() as Promise<NotificationPreferencesResponse>;
  },
});
