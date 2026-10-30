import { useNotificationStreamConnection } from "@packages/web-kit/notifications/use-notification-stream";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/api-client";

const LIVE_QUERY_PREFIXES = [
  ["admin", "approvals"],
  ["admin", "users"],
  ["admin", "staff"],
];

export function useStaffLiveUpdates(): void {
  const queryClient = useQueryClient();

  useNotificationStreamConnection({
    connect: (signal) => api.notifications.stream.$get({}, { init: { signal } }),
    onNotification: () => {
      for (const queryKey of LIVE_QUERY_PREFIXES) void queryClient.invalidateQueries({ queryKey });
    },
  });
}
