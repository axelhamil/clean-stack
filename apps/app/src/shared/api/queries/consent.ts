import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

export const consentQueryOptions = queryOptions({
  queryKey: ["consent"] as const,
  queryFn: async () => {
    const res = await api.consents.$get();
    if (!res.ok) await throwApiError(res, "loadConsent");
    return res.json();
  },
  staleTime: Number.POSITIVE_INFINITY,
});
