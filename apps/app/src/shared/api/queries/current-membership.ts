import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";

/** Prefix matching every organization's membership entry — for auth-wide refetches. */
export const CURRENT_MEMBERSHIP_QUERY_PREFIX = ["current-membership"] as const;

// No `enabled` guard: `null` is a scope the endpoint answers, not a missing
// argument. With no active organization the caller has no membership, and
// `null` is the correct — cacheable — answer for that scope.
export const currentMembershipQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: [...CURRENT_MEMBERSHIP_QUERY_PREFIX, organizationId] as const,
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
    staleTime: AUTH_QUERY_STALE_TIME_MS,
  });
