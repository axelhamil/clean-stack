import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $get = api.admin.users[":id"].$get;

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin", "users", "detail", id] as const,
    queryFn: async ({ signal }) => {
      const res = await $get({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadAdminUser");

      return res.json();
    },
  });
