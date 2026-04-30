import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const currentMembershipQueryOptions = queryOptions({
  queryKey: ["current-membership"] as const,
  queryFn: async ({ signal }) => {
    const { data, error } = await authClient.organization.getActiveMember({
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
