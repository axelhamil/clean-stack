import { authorizeStaff, type StaffPermission, staffReachable } from "@packages/access-control";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../api/queries/session";
import { staffOf } from "./staff-access";

export async function ensureStaffAccess({
  context,
}: {
  context: { queryClient: QueryClient };
}): Promise<void> {
  const staff = staffOf(await context.queryClient.ensureQueryData(sessionQueryOptions));
  if (!staff) throw redirect({ to: "/" });
  if (!staffReachable(staff)) throw redirect({ to: "/settings/account" });
}

export function ensureStaffPermission(permission: StaffPermission) {
  return async ({ context }: { context: { queryClient: QueryClient } }): Promise<void> => {
    const staff = staffOf(await context.queryClient.ensureQueryData(sessionQueryOptions));
    if (!authorizeStaff(staff, permission)) throw redirect({ to: "/" });
  };
}
