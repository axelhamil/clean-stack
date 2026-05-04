import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import type { PasswordPromptInput } from "../security.schema";

export interface EnableTwoFactorResult {
  totpURI: string;
  backupCodes: string[];
}

export function useEnableTwoFactor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["2fa", "enable"],
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
