import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";
import type { TwoFactorInput } from "../../../adapters/schemas/auth.schema";

export function useVerifyTwoFactor(redirectTo?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: TwoFactorInput) => {
      const { data, error } = await authClient.twoFactor.verifyTotp({
        code: input.code,
        trustDevice: input.trustDevice,
      });
      if (error) throw new Error(error.message ?? "Invalid code");

      return data;
    },
    onSuccess: async () => {
      toast.success("Verified");
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });

      broadcastAuthChange();

      void navigate({ to: redirectTo ?? "/" });
    },
    onError: (err) => toast.error(err.message),
  });
}
