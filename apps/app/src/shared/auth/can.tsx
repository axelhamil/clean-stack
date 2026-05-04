/**
 * Declarative authorization gate.
 *
 * <Can requires={{ organization: ["update"] }}>
 *   <EditButton />
 * </Can>
 *
 * Multi-resource AND (default): user needs all listed actions.
 * Multi-resource OR: pass connector="OR".
 *
 * <Can requires={{ organization: ["delete"], billing: ["manage"] }} connector="OR">
 *   <OwnerOnlyPanel />
 * </Can>
 *
 * Use `fallback` to render an alternative when denied.
 * For boolean checks (props, conditions) consume `useAuthorization().can(...)` directly.
 */
import type { OrgPermissions } from "@packages/access-control";
import type { ReactNode } from "react";
import { useAuthorization } from "./use-authorization";

interface CanProps {
  requires: OrgPermissions;
  connector?: "OR" | "AND";
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ requires, connector, fallback = null, children }: CanProps) {
  const { can } = useAuthorization();
  if (!can(requires, connector)) return <>{fallback}</>;
  return <>{children}</>;
}
