import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toAuthClientError } from "../../../shared/api/errors/api-error";
import { toastError } from "../../../shared/api/errors/toast";
import { createUpload, deleteUploadByUrl } from "../../../shared/api/mutations/create-upload";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { errorFallback } from "../../../shared/i18n/get-errors-t";
import { captureError } from "../../../shared/observability/sentry";

export function useUpdateAvatar(previousImage: string | null) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["account", "update-avatar"],
    mutationFn: async (file: File) => {
      const { publicUrl } = await createUpload({ file, scope: "avatars" });
      const { error } = await authClient.updateUser({ image: publicUrl });
      if (error) throw toAuthClientError(error, t("account.avatarUpdateFailed"));

      if (previousImage && previousImage !== publicUrl) {
        // Fire-and-forget cleanup: the avatar is already saved, a stale object
        // in storage must not fail the mutation, but it still reaches telemetry.
        await deleteUploadByUrl(previousImage).catch((err: unknown) => {
          captureError(err, { context: "avatar.deletePrevious" });
        });
      }

      return publicUrl;
    },
    onSuccess: (publicUrl) => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, (old) =>
        old ? { ...old, user: { ...old.user, image: publicUrl } } : old,
      );
      broadcastAuthChange();
      toast.success(t("account.avatarUpdatedToast"));
    },
    onError: (err) => toastError(err, errorFallback("updateAvatar")),
  });
}
