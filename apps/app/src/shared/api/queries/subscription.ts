import { queryOptions } from "@tanstack/react-query";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";
import type { EntitlementsView } from "./billing-types";

export type { EntitlementsView } from "./billing-types";

export const subscriptionQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: ["billing", "subscription", organizationId] as const,
    enabled: organizationId !== null,
    queryFn: async (): Promise<EntitlementsView> => {
      const res = await api.billing.subscription.$get();
      if (!res.ok)
        await throwApiError(
          res,
          getErrorsT()("fallback.loadSubscription", {
            defaultValue: "Failed to load subscription",
          }),
        );
      return res.json() as Promise<EntitlementsView>;
    },
    staleTime: AUTH_QUERY_STALE_TIME_MS,
  });
