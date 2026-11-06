import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $stop = api.admin.impersonation.stop.$post;

export const stopImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "stop"] as const,
  mutationFn: async (): Promise<void> => {
    const res = await $stop();
    if (!res.ok) await throwApiError(res, "stopImpersonation");
  },
});
