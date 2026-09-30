import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import type { ImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { useUpdateAvatar } from "../hooks/use-update-avatar";

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
  guard: ImpersonationGuard;
}

export function UploadAvatar({ name, guard }: UploadAvatarProps) {
  const { t } = useTranslation("settings");
  const { data: session } = useQuery(sessionQueryOptions);
  const image = session?.user.image;
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useUpdateAvatar(image ?? null);

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
        disabled={mutation.isPending || guard.blocked}
        {...guard.describeProps(mutation.isPending)}
        onClick={() => inputRef.current?.click()}
      >
        {mutation.isPending ? t("account.uploading") : t("account.changeAvatar")}
      </Button>
    </div>
  );
}
