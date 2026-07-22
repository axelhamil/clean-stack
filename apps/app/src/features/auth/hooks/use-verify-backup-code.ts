import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import type { BackupCodeVerifyInput } from "../../../shared/auth/auth.schema";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";

export function useVerifyBackupCode(redirectTo?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["session", "verify-backup-code"],
    mutationFn: async (input: BackupCodeVerifyInput) => {
      const { data, error } = await authClient.twoFactor.verifyBackupCode({
        code: input.code,
        trustDevice: input.trustDevice,
      });
      if (error) throw new Error(error.message ?? "Invalid backup code");
      return data;
    },
    onSuccess: async () => {
      toast.success("Verified");
      toast.info("That code is now used. Consider regenerating your recovery codes in settings.");
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
      void navigate({ to: redirectTo ?? "/" });
    },
    onError: (err) => toast.error(err.message),
  });
}
