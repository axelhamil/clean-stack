import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const orgInvitationsQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: ["org-invitations", organizationId] as const,
    enabled: organizationId !== null,
    queryFn: async ({ signal }) => {
      if (organizationId === null) return [];

      const { data, error } = await authClient.organization.listInvitations({
        query: { organizationId },
        fetchOptions: { signal },
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
