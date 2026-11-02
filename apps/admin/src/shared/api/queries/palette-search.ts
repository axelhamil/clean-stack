import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $users = api.admin.users.$get;
const $orgs = api.admin.orgs.$get;
const RESULTS = "5";

export const paletteUsersQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ["admin", "users", "palette", search] as const,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await $users({ query: { search, limit: RESULTS } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadAdminUsers");

      return res.json();
    },
  });

export const paletteOrgsQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ["admin", "orgs", "palette", search] as const,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await $orgs({ query: { search, limit: RESULTS } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadAdminOrgs");

      return res.json();
    },
  });
