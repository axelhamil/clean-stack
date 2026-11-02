import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { api } from "../api-client";
import type { EntitlementsView } from "./billing-types";

export const SUBSCRIPTION_QUERY_PREFIX = ["billing", "subscription"] as const;

export const subscriptionQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: [...SUBSCRIPTION_QUERY_PREFIX, organizationId] as const,
    enabled: organizationId !== null,
    queryFn: async (): Promise<EntitlementsView> => {
      const res = await api.billing.subscription.$get();
      if (!res.ok) await throwApiError(res, "loadSubscription");
      return res.json() as Promise<EntitlementsView>;
    },
    staleTime: AUTH_QUERY_STALE_TIME_MS,
  });
