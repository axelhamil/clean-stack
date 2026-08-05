import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";

const $listOrgs = api.admin.orgs.$get;
const $getOrg = api.admin.orgs[":id"].$get;

export type AdminOrgsPage = InferResponseType<typeof $listOrgs, 200>;
export type AdminOrgDetail = InferResponseType<typeof $getOrg, 200>;

export const adminOrgsInfiniteQueryOptions = (search: string) =>
  infiniteQueryOptions({
    queryKey: ["admin", "orgs", search] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $listOrgs(
        {
          query: {
            limit: "50",
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "Impossible de charger les organisations");
      return (await res.json()) as AdminOrgsPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const adminOrgDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin", "orgs", id] as const,
    queryFn: async ({ signal }) => {
      const res = await $getOrg({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "Impossible de charger l'organisation");
      return (await res.json()) as AdminOrgDetail;
    },
  });
