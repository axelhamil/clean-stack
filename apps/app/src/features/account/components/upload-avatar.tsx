import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { createUpload, deleteUploadByUrl } from "../../../shared/api/mutations/create-upload";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
import { captureError } from "../../../shared/observability/sentry";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

interface UploadAvatarProps {
  name: string;
}

export function UploadAvatar({ name }: UploadAvatarProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions);
  const image = session?.user.image;
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationKey: ["account", "update-avatar"],
    mutationFn: async (file: File) => {
      const previousImage = session?.user.image ?? null;
      const { publicUrl } = await createUpload({ file, scope: "avatars" });
      const { error } = await authClient.updateUser({ image: publicUrl });
      if (error) throw new Error(error.message ?? t("account.avatarUpdateFailed"));

      if (previousImage && previousImage !== publicUrl) {
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
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.updateAvatar", { defaultValue: "Failed to update avatar" }),
      ),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("account.avatarFileTypeError"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t("account.avatarSizeError"));
      return;
    }
    mutation.mutate(file);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        {image ? <AvatarImage src={image} alt={name} /> : null}
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={t("account.uploadAvatarLabel")}
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {mutation.isPending ? t("account.uploading") : t("account.changeAvatar")}
      </Button>
    </div>
  );
}
