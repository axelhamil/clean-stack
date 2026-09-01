import { mutationOptions } from "@tanstack/react-query";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $cancel = api.me.delete.$delete;

export const cancelAccountDeletionMutationOptions = mutationOptions({
  mutationKey: ["account-deletion", "cancel"] as const,
  mutationFn: async () => {
    const res = await $cancel();
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.cancelAccountDeletion", { defaultValue: "Cancel failed" }),
      );
    return res.json();
  },
});
