import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation } from "@tanstack/react-query";
import { openBillingPortalMutationOptions } from "../../../shared/api/mutations/open-billing-portal";

export function useOpenPortal() {
  return useMutation({
    ...openBillingPortalMutationOptions,
    onSuccess: ({ url }: { url: string }) => {
      window.location.href = url;
    },
    onError: (err) => toastError(err, errorFallback("openBillingPortal")),
  });
}
