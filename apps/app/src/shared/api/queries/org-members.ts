import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const orgMembersQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: ["org-members", organizationId] as const,
    enabled: organizationId !== null,
    queryFn: async ({ signal }) => {
      if (organizationId === null) return [];

      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationId },
        fetchOptions: { signal },
      });
      if (error) throw error;
      return data?.members ?? [];
    },
    staleTime: 60 * 1000,
  });
