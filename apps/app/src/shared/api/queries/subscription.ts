import { queryOptions } from "@tanstack/react-query";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

type Tier = "free" | "pro" | "business";
type Feature = "audit_log" | "api" | "sso";

export type EntitlementsView = {
  rank: number;
  features: Feature[];
  maxMembers: number;
  tier: Tier;
  status: string;
};

export const subscriptionQueryOptions = queryOptions({
  queryKey: ["billing", "subscription"] as const,
  queryFn: async (): Promise<EntitlementsView> => {
    const res = await api.billing.subscription.$get();
    if (!res.ok) await throwApiError(res, "Failed to load subscription");
    return res.json() as Promise<EntitlementsView>;
  },
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
