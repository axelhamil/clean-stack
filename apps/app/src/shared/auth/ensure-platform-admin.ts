import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../api/queries/session";
import { canAccessPlatformAdmin } from "./can-access-platform-admin";
import { isPlatformAdmin } from "./is-platform-admin";

export async function ensurePlatformAdmin({
  context,
}: {
  context: { queryClient: QueryClient };
}): Promise<void> {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
  if (!isPlatformAdmin(session)) throw redirect({ to: "/" });
  if (!canAccessPlatformAdmin(session)) throw redirect({ to: "/settings/account" });
}
