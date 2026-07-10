import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../api/queries/session";

export async function ensurePlatformAdmin({
  context,
}: {
  context: { queryClient: QueryClient };
}): Promise<void> {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
  const isPlatformAdmin = (session?.user as { isPlatformAdmin?: boolean } | undefined)
    ?.isPlatformAdmin;
  if (!isPlatformAdmin) throw redirect({ to: "/" });
}
