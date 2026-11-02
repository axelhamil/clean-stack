import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import type { ApprovalStatus } from "../approvals-search";

const $list = api.admin.approvals.$get;
const $get = api.admin.approvals[":id"].$get;
const PAGE_SIZE = "50";

export const approvalsInfiniteQueryOptions = (status: ApprovalStatus | undefined) =>
  infiniteQueryOptions({
    queryKey: ["admin", "approvals", "list", status ?? null] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: {
            limit: PAGE_SIZE,
            ...(status ? { status } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadApprovals");

      return res.json();
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const approvalQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin", "approvals", "detail", id] as const,
    queryFn: async ({ signal }) => {
      const res = await $get({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadApproval");

      return res.json();
    },
  });
