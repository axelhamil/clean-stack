import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";
import type { PasswordPromptInput } from "../_schemas/account.schema";

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();

  return useMutation({
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
