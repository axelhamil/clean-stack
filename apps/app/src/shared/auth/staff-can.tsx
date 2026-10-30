import type { StaffPermission } from "@packages/access-control";
import type { ReactNode } from "react";
import { useStaffAccess } from "./use-staff-access";

interface StaffCanProps {
  permission: StaffPermission;
  children: ReactNode;
}

export function StaffCan({ permission, children }: StaffCanProps) {
  const { can } = useStaffAccess();
  if (!can(permission)) return null;

  return <>{children}</>;
}
