import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { nullWithoutActiveOrganization } from "./no-active-organization";

export const activeOrgQueryOptions = queryOptions({
  queryKey: ["active-org"] as const,
  queryFn: async ({ signal }) =>
    nullWithoutActiveOrganization(
      await authClient.organization.getFullOrganization({ fetchOptions: { signal } }),
    ),
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
