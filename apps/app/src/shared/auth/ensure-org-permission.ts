import { authorizeRole, type OrgPermissions, type OrgRole } from "@packages/access-control";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { currentMembershipQueryOptions } from "../api/queries/current-membership";

interface EnsureOrgPermissionOptions {
  redirectTo?: string;
  connector?: "OR" | "AND";
}

export function ensureOrgPermission(
  permissions: OrgPermissions,
  { redirectTo = "/settings/team", connector }: EnsureOrgPermissionOptions = {},
) {
  return async ({ context }: { context: { queryClient: QueryClient } }) => {
    const membership = await context.queryClient.ensureQueryData(currentMembershipQueryOptions);
    const role = membership?.role as OrgRole | undefined;
    if (!authorizeRole(role, permissions, connector)) {
      throw redirect({ to: redirectTo });
    }
  };
}
