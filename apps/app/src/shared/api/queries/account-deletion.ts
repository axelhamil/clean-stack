import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $preflight = api.me.delete.preflight.$get;

export const preflightDeletionQueryOptions = queryOptions({
  queryKey: ["rgpd", "preflight-deletion"] as const,
  queryFn: async () => {
    const res = await $preflight();
    if (!res.ok) await throwApiError(res, "preflightDeletion");

    return res.json();
  },
  staleTime: 30 * 1000,
});
