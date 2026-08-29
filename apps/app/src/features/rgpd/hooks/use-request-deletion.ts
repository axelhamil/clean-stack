import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { requestAccountDeletionMutationOptions } from "../../../shared/api/mutations/request-account-deletion";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";

interface UseRequestDeletionOptions {
  onClose: () => void;
}

export function useRequestDeletion({ onClose }: UseRequestDeletionOptions) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    ...requestAccountDeletionMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      onClose();
      toast.success(t("deletion.requestedToast"));
    },
    // Errors are surfaced by the calling form so it can branch on `err.code`
    // (ACCOUNT_DELETION_BLOCKED gets a special UI path with the offending org list).
  });
}
