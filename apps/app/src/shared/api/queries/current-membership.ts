import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { isOrgRole } from "../../auth/role-labels";
import { nullWithoutActiveOrganization } from "./no-active-organization";

/** Prefix matching every organization's membership entry, for auth-wide refetches. */
export const CURRENT_MEMBERSHIP_QUERY_PREFIX = ["current-membership"] as const;

// No `enabled` guard: `null` is a scope the endpoint answers, not a missing
// argument. With no active organization the caller has no membership, and
// `null` is the correct (cacheable) answer for that scope.
export const currentMembershipQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: [...CURRENT_MEMBERSHIP_QUERY_PREFIX, organizationId] as const,
    queryFn: async ({ signal }) => {
      const member = nullWithoutActiveOrganization(
        await authClient.organization.getActiveMember({ fetchOptions: { signal } }),
      );
      if (!member) return null;

      // BetterAuth types the role as a free string. Narrowing it here types it
      // once for every reader; a role outside ours grants nothing, the same
      // fail-closed answer as no membership at all.
      const { role } = member;
      return isOrgRole(role) ? { ...member, role } : null;
    },
    staleTime: AUTH_QUERY_STALE_TIME_MS,
  });
