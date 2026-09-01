import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatApiError } from "../../../shared/api/errors/messages";
import { requestDataExportMutationOptions } from "../../../shared/api/mutations/request-data-export";
import { sessionQueryOptions } from "../../../shared/api/queries/session";

export function useRequestExport() {
  const { t } = useTranslation("errors");
  const { t: tSettings } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    ...requestDataExportMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      toast.success(tSettings("dataExport.requestedToast"));
    },
    onError: (err) => toast.error(formatApiError(err, tSettings("dataExport.requestFailed"), t)),
  });
}
