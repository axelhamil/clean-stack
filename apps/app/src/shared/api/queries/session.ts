import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { errorFallback } from "../../i18n/get-errors-t";
import { toAuthClientError } from "../errors/api-error";

type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"] as const,
  queryFn: async (): Promise<SessionData | null> => {
    const { data, error } = await authClient.getSession();

    if (error && error.status !== 401) {
      throw toAuthClientError(error, errorFallback("loadSession"));
    }

    return data ?? null;
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
