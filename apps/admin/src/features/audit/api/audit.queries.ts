import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import type { AuditQuery } from "../audit-filters";

const $list = api.admin["audit-log"].$get;
const $verify = api.admin["audit-log"].verify.$get;
const PAGE_SIZE = "50";

export const auditInfiniteQueryOptions = (filters: AuditQuery) =>
  infiniteQueryOptions({
    queryKey: ["admin", "audit", "list", filters] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: { ...filters, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadAuditLog");

      return res.json();
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const chainVerifyQueryOptions = queryOptions({
  queryKey: ["admin", "audit", "verify"] as const,
  queryFn: async ({ signal }) => {
    const res = await $verify({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "verifyAuditChain");

    return res.json();
  },
});
