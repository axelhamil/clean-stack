import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";
import type { PasswordPromptInput } from "../_schemas/account.schema";

export interface EnableTwoFactorResult {
  totpURI: string;
  backupCodes: string[];
}

export function useEnableTwoFactor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PasswordPromptInput): Promise<EnableTwoFactorResult> => {
      const { data, error } = await authClient.twoFactor.enable({
        password: input.password,
      });
      if (error) throw new Error(error.message ?? "Failed to enable 2FA");
      if (!data?.totpURI || !data.backupCodes) throw new Error("Invalid response from server");
      return { totpURI: data.totpURI, backupCodes: data.backupCodes };
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
