import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const activeOrgQueryOptions = queryOptions({
  queryKey: ["active-org"] as const,
  queryFn: async ({ signal }) => {
    const { data, error } = await authClient.organization.getFullOrganization({
      fetchOptions: { signal },
    });
    if (error) {
      if (error.code === "NO_ACTIVE_ORGANIZATION") return null;
      throw error;
    }
    return data ?? null;
  },
  staleTime: 5 * 60 * 1000,
});
