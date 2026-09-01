import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { passkeysQueryOptions } from "../../../shared/api/queries/passkeys";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
import type { AddPasskeyInput } from "../security.schema";

export function useAddPasskey() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["passkeys", "add"],
    mutationFn: async (input: AddPasskeyInput) => {
      const result = await authClient.passkey.addPasskey({ name: input.name });
      if (result?.error) {
        if (result.error.message?.toLowerCase().includes("not allowed"))
          throw new Error("Cancelled");
        throw new Error(result.error.message ?? t("passkeys.addFailed"));
      }
    },
    onSuccess: async () => {
      toast.success(t("passkeys.addedToast"));
      await queryClient.invalidateQueries({
        queryKey: passkeysQueryOptions.queryKey,
      });
    },
    onError: (err) => {
      if (err.message !== "Cancelled")
        toastError(
          err,
          getErrorsT()("fallback.addPasskey", {
            defaultValue: "Couldn't add that passkey. Please try again.",
          }),
        );
    },
  });
}
