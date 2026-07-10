import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";
import { type AuditLogFilters, serializeFilters } from "../audit-log-filters";

const $list = api.admin["audit-log"].$get;
const $verify = api.admin["audit-log"].verify.$get;
export type AuditLogPage = InferResponseType<typeof $list, 200>;
export type AuditRow = AuditLogPage["items"][number];
export type ChainVerification = InferResponseType<typeof $verify, 200>;

export const auditLogInfiniteQueryOptions = (filters: AuditLogFilters) =>
  infiniteQueryOptions({
    queryKey: ["admin", "audit-log", filters] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: {
            ...serializeFilters(filters),
            limit: "50",
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "Failed to load audit log");
      return (await res.json()) as AuditLogPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const chainVerifyQueryOptions = queryOptions({
  queryKey: ["admin", "audit-log", "verify"] as const,
  queryFn: async (): Promise<ChainVerification> => {
    const res = await $verify();
    if (!res.ok) await throwApiError(res, "Failed to verify chain");
    return (await res.json()) as ChainVerification;
  },
  staleTime: 60 * 1000,
});
