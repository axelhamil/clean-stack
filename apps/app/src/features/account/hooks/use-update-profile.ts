import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import type { UpdateProfileInput } from "../account.schema";

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["account", "update-profile"],
    mutationFn: async (input: UpdateProfileInput) => {
      const { error } = await authClient.updateUser({ name: input.name });
      if (error) throw new Error(error.message ?? "Failed to update profile");
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      toast.success("Profile updated");
    },
    onError: (err) => toast.error(err.message),
  });
}
