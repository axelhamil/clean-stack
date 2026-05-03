import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatApiError } from "../../../adapters/errors/messages";
import { requestDataExportMutationOptions } from "../../../adapters/mutations/request-data-export";
import { sessionQueryOptions } from "../../../adapters/queries/session";

export function useRequestExport() {
  const queryClient = useQueryClient();

  return useMutation({
    ...requestDataExportMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      toast.success("Export requested. Check your inbox for the download link.");
    },
    onError: (err) =>
      toast.error(formatApiError(err, "Couldn't request data export. Please try again.")),
  });
}
