import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";

const $request = api.consents.$delete;

type WithdrawResponse = InferResponseType<typeof $request, 200>;

export const withdrawConsentMutationOptions = mutationOptions({
  mutationKey: ["consent", "withdraw"] as const,
  mutationFn: async (): Promise<WithdrawResponse> => {
    const res = await $request();
    if (!res.ok) await throwApiError(res, "withdrawConsent");
    return res.json();
  },
});
