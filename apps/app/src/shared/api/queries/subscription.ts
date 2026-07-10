import { queryOptions } from "@tanstack/react-query";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";
import type { EntitlementsView } from "./billing-types";

export type { EntitlementsView } from "./billing-types";

export const subscriptionQueryOptions = queryOptions({
  queryKey: ["billing", "subscription"] as const,
  queryFn: async (): Promise<EntitlementsView> => {
    const res = await api.billing.subscription.$get();
    if (!res.ok) await throwApiError(res, "Failed to load subscription");
    return res.json() as Promise<EntitlementsView>;
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
