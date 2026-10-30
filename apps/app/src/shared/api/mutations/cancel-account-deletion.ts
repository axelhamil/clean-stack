import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $cancel = api.me.delete.$delete;

export const cancelAccountDeletionMutationOptions = mutationOptions({
  mutationKey: ["account-deletion", "cancel"] as const,
  mutationFn: async () => {
    const res = await $cancel();
    if (!res.ok) await throwApiError(res, "cancelAccountDeletion");
    return res.json();
  },
});
