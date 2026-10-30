import type { StaffPermission } from "@packages/access-control";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../api/queries/session";
import { staffCan, staffOf } from "./staff-access";

export async function ensureStaffAccess({
  context,
}: {
  context: { queryClient: QueryClient };
}): Promise<void> {
  const staff = staffOf(await context.queryClient.ensureQueryData(sessionQueryOptions));
  if (!staff) throw redirect({ to: "/" });
  if (!staff.mfaOk) throw redirect({ to: "/settings/account" });
}

export function ensureStaffPermission(permission: StaffPermission) {
  return async ({ context }: { context: { queryClient: QueryClient } }): Promise<void> => {
    const staff = staffOf(await context.queryClient.ensureQueryData(sessionQueryOptions));
    if (!staffCan(staff, permission)) throw redirect({ to: "/" });
  };
}
