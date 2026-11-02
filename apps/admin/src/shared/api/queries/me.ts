import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $me = api.admin.me.$get;

export const meQueryOptions = queryOptions({
  queryKey: ["admin", "me"] as const,
  queryFn: async ({ signal }) => {
    const res = await $me({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadSession");

    return res.json();
  },
  staleTime: 0,
  retry: false,
  networkMode: "always",
  refetchOnWindowFocus: "always",
});
