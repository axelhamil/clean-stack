import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";
import type { SignInInput } from "../_schemas/auth.schema";

export function useSignIn(redirectTo?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: SignInInput) => {
      const { data, error } = await authClient.signIn.email({
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      });

      if (error) {
        const code = error.code ?? "";
        if (code === "EMAIL_NOT_VERIFIED" || /verif/i.test(error.message ?? ""))
          void navigate({ to: "/verify-email" });

        throw new Error(error.message ?? "Sign-in failed");
      }

      return data;
    },
    onSuccess: async () => {
      toast.success("Welcome back");

      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });

      broadcastAuthChange();

      void navigate({ to: redirectTo ?? "/" });
    },
    onError: (err) => toast.error(err.message),
  });
}
