import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { toAuthClientError } from "../errors/api-error";

export const sessionsQueryOptions = queryOptions({
  queryKey: ["sessions"] as const,
  queryFn: async () => {
    const { data, error } = await authClient.listSessions();
    if (error) {
      throw toAuthClientError(
        error,
        getErrorsT()("fallback.loadSessions", { defaultValue: "Failed to load sessions" }),
      );
    }

    return data ?? [];
  },
  staleTime: 30 * 1000,
});
