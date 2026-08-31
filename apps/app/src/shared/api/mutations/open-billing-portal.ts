import { mutationOptions } from "@tanstack/react-query";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

export const openBillingPortalMutationOptions = mutationOptions({
  mutationKey: ["billing", "portal"] as const,
  mutationFn: async () => {
    const res = await api.billing.portal.$post();
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.openBillingPortal", {
          defaultValue: "Failed to open billing portal",
        }),
      );
    return res.json();
  },
});
