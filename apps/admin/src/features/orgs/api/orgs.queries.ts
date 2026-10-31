import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $list = api.admin.orgs.$get;
const $get = api.admin.orgs[":id"].$get;
const PAGE_SIZE = "50";

export const orgsInfiniteQueryOptions = (search: string) =>
  infiniteQueryOptions({
    queryKey: ["admin", "orgs", "list", search] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: {
            limit: PAGE_SIZE,
            ...(search ? { search } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadAdminOrgs");

      return res.json();
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const orgQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin", "orgs", "detail", id] as const,
    queryFn: async ({ signal }) => {
      const res = await $get({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadAdminOrg");

      return res.json();
    },
  });
