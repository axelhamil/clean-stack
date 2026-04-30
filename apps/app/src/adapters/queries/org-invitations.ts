import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const orgInvitationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: ["org-invitations", organizationId] as const,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient.organization.listInvitations({
        query: { organizationId },
        fetchOptions: { signal },
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
