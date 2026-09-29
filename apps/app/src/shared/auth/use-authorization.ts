import { authorizeRole, type OrgPermissions, type OrgRole } from "@packages/access-control";
import { useQuery } from "@tanstack/react-query";
import { currentMembershipQueryOptions } from "../api/queries/current-membership";
import { useActiveOrgId } from "./use-active-org-id";

export type { OrgPermissions, OrgRole };

/**
 * What a navigation entry (settings tab, command-palette route) declares to be
 * shown: the permissions it needs and whether it only makes sense inside an org.
 * Same tuple the route file passes to `ensureOrgPermission`.
 */
export interface NavigationRequirement {
  requires?: OrgPermissions;
  requiresOrg?: boolean;
}

export interface UseAuthorizationResult {
  role: OrgRole | undefined;
  isLoading: boolean;
  hasMembership: boolean;
  can: (permissions: OrgPermissions, connector?: "OR" | "AND") => boolean;
  canReach: (requirement: NavigationRequirement) => boolean;
}

export function useAuthorization(): UseAuthorizationResult {
  const organizationId = useActiveOrgId();
  const { data: membership, isPending } = useQuery(currentMembershipQueryOptions(organizationId));
  const role = membership?.role as OrgRole | undefined;
  const hasMembership = role !== undefined;
  const can = (permissions: OrgPermissions, connector?: "OR" | "AND") =>
    authorizeRole(role, permissions, connector);

  return {
    role,
    isLoading: isPending,
    hasMembership,
    can,
    canReach: ({ requires, requiresOrg }) => {
      if (requiresOrg && !hasMembership) return false;
      if (requires) return can(requires);
      return true;
    },
  };
}
