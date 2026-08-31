import { queryOptions } from "@tanstack/react-query";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";
import type { PlanCatalogItem } from "./billing-types";

export type { PlanCatalogItem } from "./billing-types";

export const plansQueryOptions = queryOptions({
  queryKey: ["billing", "plans"] as const,
  queryFn: async (): Promise<PlanCatalogItem[]> => {
    const res = await api.billing.plans.$get();
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.loadPlans", { defaultValue: "Failed to load plans" }),
      );
    return (await res.json()).plans as PlanCatalogItem[];
  },
  staleTime: 5 * 60 * 1000,
});
