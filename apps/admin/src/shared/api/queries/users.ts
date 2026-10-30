import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $list = api.admin.users.$get;
const PAGE_SIZE = "50";

export interface UserQuery {
  search?: string;
  banned?: "true" | "false";
  organizationId?: string;
}

export const usersInfiniteQueryOptions = (filters: UserQuery) =>
  infiniteQueryOptions({
    queryKey: ["admin", "users", "list", filters] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: { ...filters, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadAdminUsers");

      return res.json();
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
