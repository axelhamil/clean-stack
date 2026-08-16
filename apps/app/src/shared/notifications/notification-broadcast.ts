import type { QueryClient } from "@tanstack/react-query";
import type {
  Notification,
  NotificationsResponse,
  UnreadCountResponse,
} from "../api/queries/notifications";
import { createBroadcastChannel } from "../hooks/use-broadcast-channel";

export type NotificationReadMessage = { ids: string[] } | { all: true };

const LIST_QUERY_KEY = ["notifications", "list"] as const;
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
  const cachedLists = queryClient.getQueriesData({ queryKey: LIST_QUERY_KEY });
  let newlyRead = 0;

  queryClient.setQueriesData<NotificationsResponse>({ queryKey: LIST_QUERY_KEY }, (data) => {
    if (!data) return data;
    let touched = false;

    const items = data.items.map((item) => {
      if (item.readAt !== null || !targets(message, item)) return item;
      touched = true;
      newlyRead += 1;
      return { ...item, readAt };
    });

    return touched ? { ...data, items } : data;
  });

  queryClient.setQueryData<UnreadCountResponse>(UNREAD_COUNT_QUERY_KEY, (data) => {
    if (!data) return data;
    if ("all" in message) return { ...data, count: 0 };
    const delta = cachedLists.length > 0 ? newlyRead : message.ids.length;
    return { ...data, count: Math.max(0, data.count - delta) };
  });
}
