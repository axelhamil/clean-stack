import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { createUpload } from "../../../shared/api/mutations/create-upload";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";

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
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions);
  const image = session?.user.image;
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationKey: ["account", "update-avatar"],
    mutationFn: async (file: File) => {
      const { publicUrl } = await createUpload({ file, scope: "avatars" });
      const { error } = await authClient.updateUser({ image: publicUrl });
      if (error) throw new Error(error.message ?? "Failed to update avatar");
      return publicUrl;
    },
    onSuccess: (publicUrl) => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, (old) =>
        old ? { ...old, user: { ...old.user, image: publicUrl } } : old,
      );
      broadcastAuthChange();
      toast.success("Avatar updated");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image must be under 5 MB.");
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
        aria-label="Upload a new avatar image"
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
        {mutation.isPending ? "Uploading…" : "Change avatar"}
      </Button>
    </div>
  );
}
