import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";
import type { VerifyTotpSetupInput } from "../_schemas/account.schema";

export function useVerifyTwoFactorSetup() {
  const queryClient = useQueryClient();

  return useMutation({
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
