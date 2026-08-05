import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";
import { serializeUserFilters, type UserFilters } from "../admin-user-filters";

const $listUsers = api.admin.users.$get;
const $getUser = api.admin.users[":id"].$get;

export type AdminUsersPage = InferResponseType<typeof $listUsers, 200>;
export type AdminUserListItem = AdminUsersPage["items"][number];
export type AdminUserDetail = InferResponseType<typeof $getUser, 200>;

export const adminUsersInfiniteQueryOptions = (filters: UserFilters) =>
  infiniteQueryOptions({
    queryKey: ["admin", "users", filters] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $listUsers(
        {
          query: {
            ...serializeUserFilters(filters),
            limit: "50",
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "Failed to load accounts");
      return (await res.json()) as AdminUsersPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const adminUserQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin", "users", id] as const,
    queryFn: async ({ signal }) => {
      const res = await $getUser({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "Failed to load account");
      return (await res.json()) as AdminUserDetail;
    },
  });
