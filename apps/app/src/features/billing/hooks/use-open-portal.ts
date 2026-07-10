import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { openBillingPortalMutationOptions } from "../../../shared/api/mutations/open-billing-portal";

export function useOpenPortal() {
  return useMutation({
    ...openBillingPortalMutationOptions,
    onSuccess: ({ url }: { url: string }) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
