import { authorizeRole, type OrgPermissions, type OrgRole } from "@packages/access-control";
import { useQuery } from "@tanstack/react-query";
import { currentMembershipQueryOptions } from "../api/queries/current-membership";

export type { OrgPermissions, OrgRole };

export interface UseAuthorizationResult {
  role: OrgRole | undefined;
  isLoading: boolean;
  hasMembership: boolean;
  can: (permissions: OrgPermissions, connector?: "OR" | "AND") => boolean;
}

export function useAuthorization(): UseAuthorizationResult {
  const { data: membership, isPending } = useQuery(currentMembershipQueryOptions);
  const role = membership?.role as OrgRole | undefined;
  return {
    role,
    isLoading: isPending,
    hasMembership: role !== undefined,
    can: (permissions, connector) => authorizeRole(role, permissions, connector),
  };
}
