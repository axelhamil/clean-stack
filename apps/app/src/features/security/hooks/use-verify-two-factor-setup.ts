import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import type { VerifyTotpSetupInput } from "../security.schema";

export function useVerifyTwoFactorSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["2fa", "verify-setup"],
    mutationFn: async (input: VerifyTotpSetupInput) => {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: input.code,
      });
      if (error) throw new Error(error.message ?? "Invalid code");
    },
    onSuccess: async () => {
      toast.success("Two-factor authentication enabled");
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
