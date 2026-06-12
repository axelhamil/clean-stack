import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { SignUpInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "./auth-error";

export function useSignUp() {
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["session", "sign-up"],
    mutationFn: async ({ acceptedPolicies: _accepted, ...input }: SignUpInput) => {
      const { data, error } = await authClient.signUp.email({
        email: input.email,
        password: input.password,
        name: input.name,
      });
      if (error) throw new Error(resolveAuthError(error, "Sign-up failed"));

      return data;
    },
    onSuccess: () => {
      toast.success("Account created — check your email to verify");
      void navigate({ to: "/verify-email" });
    },
    onError: (err) => toast.error(err.message),
  });
}
