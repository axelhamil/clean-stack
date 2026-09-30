import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired } from "../auth-error";
import { useCompleteSignIn } from "./use-complete-sign-in";

interface UsePasskeyAutofillOptions {
  enabled: boolean;
  redirectTo?: string;
}

interface PasskeyAutofillHandle {
  abort: () => void;
}

export function usePasskeyAutofill({
  enabled,
  redirectTo,
}: UsePasskeyAutofillOptions): PasskeyAutofillHandle {
  const { t } = useTranslation("auth");
  const completeSignIn = useCompleteSignIn();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const result = await authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: { signal: controller.signal },
        });
        if (controller.signal.aborted) return;

        if (result?.error) {
          // Conditional UI stays silent on every expected failure, but an SSO-enforced
          // domain is not a failure to hide: send the user to their IdP instead of
          // leaving the autofill prompt dead with no feedback.
          await redirectToSsoIfRequired(result.error);
          return;
        }

        toast.success(t("signIn.success"));
        await completeSignIn(redirectTo);
      } catch {
        // Passive conditional passkey UI: cancel, abort and no-credential are expected, never surfaced.
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [enabled, redirectTo, completeSignIn, t]);

  return {
    abort: () => abortRef.current?.abort(),
  };
}
