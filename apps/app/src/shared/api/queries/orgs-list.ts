import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const orgsListQueryOptions = queryOptions({
  queryKey: ["orgs"] as const,
  queryFn: async ({ signal }) => {
    const { data, error } = await authClient.organization.list({
      fetchOptions: { signal },
    });
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 5 * 60 * 1000,
});
