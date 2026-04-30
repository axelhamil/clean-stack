import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "../../../adapters/auth-client";
import { orgsListQueryOptions } from "../../../adapters/queries/orgs-list";

export async function switchToFirstRemainingOrg(queryClient: QueryClient): Promise<void> {
  const orgs = await queryClient.fetchQuery(orgsListQueryOptions);
  const next = orgs[0];
  if (!next) return;
  await authClient.organization.setActive({ organizationId: next.id });
}
