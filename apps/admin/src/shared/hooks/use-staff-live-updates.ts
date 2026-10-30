import { useNotificationStreamConnection } from "@packages/web-kit/notifications/use-notification-stream";
import { useQueryClient } from "@tanstack/react-query";
import { ADMIN_QUERY_SCOPES } from "../api/admin-query-scopes";
import { api } from "../api/api-client";

export function useStaffLiveUpdates(): void {
  const queryClient = useQueryClient();
  const refreshLiveQueries = () => {
    for (const queryKey of ADMIN_QUERY_SCOPES) void queryClient.invalidateQueries({ queryKey });
  };

  useNotificationStreamConnection({
    connect: (signal) => api.notifications.stream.$get({}, { init: { signal } }),
    onNotification: refreshLiveQueries,
    onReconnect: refreshLiveQueries,
  });
}
