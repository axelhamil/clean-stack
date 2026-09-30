import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatApiError } from "../../../shared/api/errors/messages";
import { cancelAccountDeletionMutationOptions } from "../../../shared/api/mutations/cancel-account-deletion";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";

export function useCancelDeletion() {
  const { t } = useTranslation("settings");
  const { t: tErrors } = useTranslation("errors");
  const refreshSession = useRefreshSession();

  return useMutation({
    ...cancelAccountDeletionMutationOptions,
    onSuccess: async () => {
      await refreshSession();
      toast.success(t("deletion.cancelledToast"));
    },
    onError: (err) => toast.error(formatApiError(err, t("deletion.cancelFailed"), tErrors)),
  });
}
