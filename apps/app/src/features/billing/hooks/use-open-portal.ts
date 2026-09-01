import { useMutation } from "@tanstack/react-query";
import { toastError } from "../../../shared/api/errors/toast";
import { openBillingPortalMutationOptions } from "../../../shared/api/mutations/open-billing-portal";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";

export function useOpenPortal() {
  return useMutation({
    ...openBillingPortalMutationOptions,
    onSuccess: ({ url }: { url: string }) => {
      window.location.href = url;
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.openBillingPortal", {
          defaultValue: "Failed to open billing portal",
        }),
      ),
  });
}
