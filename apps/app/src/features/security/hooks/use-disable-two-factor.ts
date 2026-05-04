import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import type { PasswordPromptInput } from "../security.schema";

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["2fa", "disable"],
    mutationFn: async (input: PasswordPromptInput) => {
      const { error } = await authClient.twoFactor.disable({
        password: input.password,
      });
      if (error) throw new Error(error.message ?? "Failed to disable 2FA");
    },
    onSuccess: async () => {
      toast.success("Two-factor authentication disabled");
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
