import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { requestAccountDeletionMutationOptions } from "../../../adapters/mutations/request-account-deletion";
import { sessionQueryOptions } from "../../../adapters/queries/session";

interface UseRequestDeletionOptions {
  onClose: () => void;
}

export function useRequestDeletion({ onClose }: UseRequestDeletionOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    ...requestAccountDeletionMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      onClose();
      toast.success("Account scheduled for deletion. You can cancel before the grace period ends.");
    },
    // Errors are surfaced by the calling form so it can branch on `err.code`
    // (ACCOUNT_DELETION_BLOCKED gets a special UI path with the offending org list).
  });
}
