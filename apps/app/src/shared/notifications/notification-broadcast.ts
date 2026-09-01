import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import {
  type Notification,
  type NotificationsResponse,
  notificationsListQueryKey,
  type UnreadCountResponse,
} from "../api/queries/notifications";
import { createBroadcastChannel } from "../hooks/use-broadcast-channel";

export type NotificationReadMessage = { ids: string[] } | { all: true };

type NotificationsListCache = InfiniteData<NotificationsResponse, string | undefined>;

const UNREAD_COUNT_QUERY_KEY = ["notifications", "unread-count"] as const;

export const notificationReadChannel =
  createBroadcastChannel<NotificationReadMessage>("notifications-read");

const targets = (message: NotificationReadMessage, item: Notification) =>
  "all" in message || message.ids.includes(item.id);

export function applyRead(
  queryClient: QueryClient,
  message: NotificationReadMessage,
  readAt: string,
): void {
  const cachedLists = queryClient.getQueriesData({ queryKey: notificationsListQueryKey });
  let newlyRead = 0;

  // The list is one infinite query (all loaded pages under one cache entry),
  // so patching it in place — instead of invalidating — keeps every page the
  // user already scrolled to "load more" through, rather than dropping them
  // back to a single page on the next refetch.
  queryClient.setQueriesData<NotificationsListCache>(
    { queryKey: notificationsListQueryKey },
    (data) => {
      if (!data) return data;
      let touched = false;

      const pages = data.pages.map((page) => {
        let pageTouched = false;

        const items = page.items.map((item) => {
          if (item.readAt !== null || !targets(message, item)) return item;
          pageTouched = true;
          touched = true;
          newlyRead += 1;
          return { ...item, readAt };
        });

        return pageTouched ? { ...page, items } : page;
      });

      return touched ? { ...data, pages } : data;
    },
  );

  queryClient.setQueryData<UnreadCountResponse>(UNREAD_COUNT_QUERY_KEY, (data) => {
    if (!data) return data;
    if ("all" in message) return { ...data, count: 0 };
    const delta = cachedLists.length > 0 ? newlyRead : message.ids.length;
    return { ...data, count: Math.max(0, data.count - delta) };
  });
}
