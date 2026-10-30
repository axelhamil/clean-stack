import type { StaffPermission } from "@packages/access-control";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "../api/queries/session";
import { staffCan, staffOf } from "./staff-access";

export function useStaffAccess() {
  const { data: session } = useQuery(sessionQueryOptions);
  const staff = staffOf(session);

  return {
    staff,
    can: (permission: StaffPermission) => staffCan(staff, permission),
  };
}
