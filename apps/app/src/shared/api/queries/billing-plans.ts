import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

type Tier = "free" | "pro" | "business";
type Feature = "audit_log" | "api" | "sso";

export type PlanCatalogItem = {
  tier: Tier;
  name: string;
  priceId: string | null;
  unitAmount: number;
  currency: string;
  interval: string | null;
  marketingFeatures: string[];
  rank: number;
  features: Feature[];
  maxMembers: number | null;
};

export const plansQueryOptions = queryOptions({
  queryKey: ["billing", "plans"] as const,
  queryFn: async (): Promise<PlanCatalogItem[]> => {
    const res = await api.billing.plans.$get();
    if (!res.ok) await throwApiError(res, "Failed to load plans");
    return (await res.json()).plans as PlanCatalogItem[];
  },
  staleTime: 5 * 60 * 1000,
});
