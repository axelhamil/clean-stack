import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";
import type { PlanCatalogItem } from "./billing-types";

export const plansQueryOptions = queryOptions({
  queryKey: ["billing", "plans"] as const,
  queryFn: async (): Promise<PlanCatalogItem[]> => {
    const res = await api.billing.plans.$get();
    if (!res.ok) await throwApiError(res, "loadPlans");
    const body = await res.json();
    return body.plans;
  },
  staleTime: 5 * 60 * 1000,
});
