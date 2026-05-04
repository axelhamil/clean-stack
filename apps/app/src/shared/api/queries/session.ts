import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";

type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"] as const,
  queryFn: async (): Promise<SessionData | null> => {
    const { data } = await authClient.getSession();
    return data ?? null;
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
