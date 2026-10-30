import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $verify = api.admin["step-up"].$post;

export const verifyStepUpMutationOptions = mutationOptions({
  mutationKey: ["admin", "step-up"] as const,
  mutationFn: async (json: { code: string }) => {
    const res = await $verify({ json });
    if (!res.ok) await throwApiError(res, "verifyStepUp");

    return res.json();
  },
});
