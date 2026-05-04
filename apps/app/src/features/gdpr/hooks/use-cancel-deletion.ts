import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatApiError } from "../../../shared/api/errors/messages";
import { cancelAccountDeletionMutationOptions } from "../../../shared/api/mutations/cancel-account-deletion";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";

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
