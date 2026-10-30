import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const sessionsQueryOptions = queryOptions({
  queryKey: ["sessions"] as const,
  queryFn: async () => {
    const { data, error } = await authClient.listSessions();
    if (error) {
      throw toAuthClientError(error, errorFallback("loadSessions"));
    }

    return data ?? [];
  },
  staleTime: 30 * 1000,
});
