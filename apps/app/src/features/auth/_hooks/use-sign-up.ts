import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import type { SignUpInput } from "../_schemas/auth.schema";

export function useSignUp() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: SignUpInput) => {
      const { data, error } = await authClient.signUp.email({
        email: input.email,
        password: input.password,
        name: input.name,
      });
      if (error) throw new Error(error.message ?? "Sign-up failed");

      return data;
    },
    onSuccess: () => {
      toast.success("Account created — check your email to verify");
      void navigate({ to: "/verify-email" });
    },
    onError: (err) => toast.error(err.message),
  });
}
