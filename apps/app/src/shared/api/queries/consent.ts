import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

export const consentQueryOptions = queryOptions({
  queryKey: ["consent"] as const,
  queryFn: async () => {
    const res = await api.consents.$get();
    if (!res.ok) await throwApiError(res, "Failed to load consent");
    return res.json();
  },
  staleTime: Number.POSITIVE_INFINITY,
});
