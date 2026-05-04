import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";

export const orgsListQueryOptions = queryOptions({
  queryKey: ["orgs"] as const,
  queryFn: async ({ signal }) => {
    const { data, error } = await authClient.organization.list({
      fetchOptions: { signal },
    });
    if (error) throw error;
    return data ?? [];
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
