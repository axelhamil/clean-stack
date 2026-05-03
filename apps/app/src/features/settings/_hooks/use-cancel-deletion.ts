import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { formatApiError } from "../../../adapters/errors/messages";
import { cancelAccountDeletionMutationOptions } from "../../../adapters/mutations/cancel-account-deletion";
import { sessionQueryOptions } from "../../../adapters/queries/session";

export function useCancelDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    ...cancelAccountDeletionMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      toast.success("Account deletion cancelled.");
    },
    onError: (err) =>
      toast.error(formatApiError(err, "Couldn't cancel deletion. Please try again.")),
  });
}
