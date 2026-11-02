import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

export const openBillingPortalMutationOptions = mutationOptions({
  mutationKey: ["billing", "portal"] as const,
  mutationFn: async () => {
    const res = await api.billing.portal.$post();
    if (!res.ok) await throwApiError(res, "openBillingPortal");
    return res.json();
  },
});
