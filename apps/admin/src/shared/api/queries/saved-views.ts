import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $list = api.admin.views.$get;

export const SAVED_VIEWS_QUERY_KEY = ["admin", "views"] as const;

export const savedViewsQueryOptions = queryOptions({
  queryKey: SAVED_VIEWS_QUERY_KEY,
  queryFn: async ({ signal }) => {
    const res = await $list({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadSavedViews");

    return res.json();
  },
});
