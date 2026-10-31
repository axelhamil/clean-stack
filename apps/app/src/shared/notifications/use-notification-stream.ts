import { useNotificationStreamConnection } from "@packages/web-kit/notifications/use-notification-stream";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/api-client";
import { notificationsListQueryKey, unreadCountQueryOptions } from "../api/queries/notifications";
import { SUBSCRIPTION_QUERY_PREFIX } from "../api/queries/subscription";
import { addBreadcrumb } from "../observability/sentry";

// The badge stays live: always invalidate+refetch the single unread-count query. The list is an
// infinite query: if the user has "load more"'d through several pages, an eager refetch here would
// re-fetch every one of them on every single push. Mark it stale instead (`refetchType: "none"`)
// so it catches up next time the panel opens, rather than firing an N-page refetch on each event.
export function refreshOnNotification(queryClient: QueryClient): () => void {
  return () => {
    void queryClient.invalidateQueries({ queryKey: unreadCountQueryOptions.queryKey });
    void queryClient.invalidateQueries({
      queryKey: notificationsListQueryKey,
      refetchType: "none",
    });
    void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_PREFIX });
  };
}

export function useNotificationStream(): { connected: boolean } {
  const queryClient = useQueryClient();

  return useNotificationStreamConnection({
    connect: (signal) => api.notifications.stream.$get({}, { init: { signal } }),
    onNotification: refreshOnNotification(queryClient),
    onDisconnect: (attempt, err) =>
      addBreadcrumb("notification stream disconnected", { attempt, err: String(err) }),
  });
}
