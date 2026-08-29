import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatApiError } from "../../../shared/api/errors/messages";
import { cancelAccountDeletionMutationOptions } from "../../../shared/api/mutations/cancel-account-deletion";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";

export function useCancelDeletion() {
  const { t } = useTranslation("errors");
  const { t: tSettings } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    ...cancelAccountDeletionMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      toast.success(tSettings("deletion.cancelledToast"));
    },
    onError: (err) => toast.error(formatApiError(err, tSettings("deletion.cancelFailed"), t)),
  });
}
