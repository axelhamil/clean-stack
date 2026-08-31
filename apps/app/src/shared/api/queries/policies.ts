import { queryOptions } from "@tanstack/react-query";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

export const policiesQueryOptions = queryOptions({
  queryKey: ["policies"] as const,
  queryFn: async () => {
    const res = await api.me.policies.$get();
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.loadPolicies", { defaultValue: "Failed to load policies" }),
      );
    return res.json();
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
