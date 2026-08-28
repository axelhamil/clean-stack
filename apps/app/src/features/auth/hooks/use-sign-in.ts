import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import type { SignInInput } from "../../../shared/auth/auth.schema";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";

const EMAIL_NOT_VERIFIED_REDIRECT = "email-not-verified-redirect";
const SSO_REDIRECT_IN_PROGRESS = "sso-redirect-in-progress";

export function useSignIn(redirectTo?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationKey: ["session", "sign-in"],
    mutationFn: async (input: SignInInput) => {
      const { data, error } = await authClient.signIn.email({
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      });

      if (error) {
        const code = error.code ?? "";
        if (code === "EMAIL_NOT_VERIFIED" || /verif/i.test(error.message ?? "")) {
          void navigate({ to: "/verify-email" });
          throw new Error(EMAIL_NOT_VERIFIED_REDIRECT);
        }

        // The user did nothing wrong — their organization enforces SSO for this
        // domain. Redirect straight into the SSO flow instead of showing an error;
        // `providerId` comes straight off the server's rejection, no re-derivation
        // from the email (the API confirms it survives serialization).
        if (error.message === "SSO_REQUIRED") {
          const providerId = (error as { providerId?: string }).providerId;
          if (providerId) {
            const { error: ssoError } = await authClient.signIn.sso({
              providerId,
              callbackURL: `${window.location.origin}/dashboard`,
            });
            if (!ssoError) throw new Error(SSO_REDIRECT_IN_PROGRESS);
          }
        }

        throw new Error(resolveAuthError(error, "Sign-in failed"));
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
    onError: (err) => {
      if (err.message === EMAIL_NOT_VERIFIED_REDIRECT || err.message === SSO_REDIRECT_IN_PROGRESS)
        return;
      toast.error(err.message);
    },
  });
}
