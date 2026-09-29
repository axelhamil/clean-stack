import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { errorFallback } from "../../i18n/get-errors-t";
import { toAuthClientError } from "../errors/api-error";

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
