import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import type { PasswordPromptInput } from "../security.schema";

export function useGenerateBackupCodes() {
  return useMutation({
    mutationKey: ["2fa", "generate-backup-codes"],
    mutationFn: async (input: PasswordPromptInput): Promise<string[]> => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password: input.password,
      });
      if (error) throw new Error(error.message ?? "Failed to regenerate backup codes");
      if (!data?.backupCodes) throw new Error("Invalid response from server");
      return data.backupCodes;
    },
    onError: (err) => toast.error(err.message),
  });
}
