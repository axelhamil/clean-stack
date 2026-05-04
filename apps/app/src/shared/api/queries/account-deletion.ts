import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $preflight = api.me.delete.preflight.$get;

export const preflightDeletionQueryOptions = queryOptions({
  queryKey: ["rgpd", "preflight-deletion"] as const,
  queryFn: async () => {
    const res = await $preflight();
    if (!res.ok) throw new Error(`Preflight failed: HTTP ${res.status}`);
    return res.json();
  },
  staleTime: 30 * 1000,
});
