import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const orgMembersQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: ["org-members", organizationId] as const,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationId },
        fetchOptions: { signal },
      });
      if (error) throw error;
      return data?.members ?? [];
    },
    staleTime: 60 * 1000,
  });
