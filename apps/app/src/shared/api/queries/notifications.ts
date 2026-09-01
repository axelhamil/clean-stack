import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
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

export const notificationsListQueryKey = ["notifications", "list"] as const;

// A single infinite query, not one query per cursor — the query key stays
// flat (["notifications", "list"]) with pages accumulating inside it, which
// is what lets `notification-broadcast.ts` patch every loaded page in one
// `setQueriesData` call and lets the SSE handler invalidate the whole
// history without needing to know how many cursors have been fetched.
export const notificationsInfiniteQueryOptions = () =>
  infiniteQueryOptions({
    queryKey: notificationsListQueryKey,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        { query: pageParam ? { cursor: pageParam } : {} },
        { init: { signal } },
      );
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
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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

// The route is `requireOrg`, so the response is the active organization's — the key
// has to name it or one entry serves every organization the user switches between.
export const orgNotificationPreferencesQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: ["notifications", "org-preferences", organizationId] as const,
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
