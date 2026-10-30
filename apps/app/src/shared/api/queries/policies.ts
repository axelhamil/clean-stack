import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { api } from "../api-client";

export const policiesQueryOptions = queryOptions({
  queryKey: ["policies"] as const,
  queryFn: async () => {
    const res = await api.me.policies.$get();
    if (!res.ok) await throwApiError(res, "loadPolicies");
    return res.json();
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
