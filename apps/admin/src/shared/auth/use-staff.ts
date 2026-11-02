import type { StaffPermission } from "@packages/access-control";
import { useSuspenseQuery } from "@tanstack/react-query";
import { meQueryOptions } from "../api/queries/me";

export function useStaff() {
  const { data: me } = useSuspenseQuery(meQueryOptions);

  return {
    me,
    can: (permission: StaffPermission): boolean => me.permissions.includes(permission),
  };
}
