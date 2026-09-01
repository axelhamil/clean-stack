import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toAuthClientError } from "../../../shared/api/errors/api-error";
import { toastError } from "../../../shared/api/errors/toast";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
import type { PasswordPromptInput } from "../security.schema";

export interface EnableTwoFactorResult {
  totpURI: string;
  backupCodes: string[];
}

export function useEnableTwoFactor() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["2fa", "enable"],
    mutationFn: async (input: PasswordPromptInput): Promise<EnableTwoFactorResult> => {
      const { data, error } = await authClient.twoFactor.enable({
        password: input.password,
      });
      if (error) throw toAuthClientError(error, t("twoFactor.enableFailed"));
      if (!data?.totpURI || !data.backupCodes) throw new Error(t("twoFactor.unexpectedResponse"));
      return { totpURI: data.totpURI, backupCodes: data.backupCodes };
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.enableTwoFactor", {
          defaultValue: "Couldn't enable two-factor authentication. Please try again.",
        }),
      ),
  });
}
