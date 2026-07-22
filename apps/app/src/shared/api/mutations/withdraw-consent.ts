import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $request = api.consents.$delete;

type WithdrawResponse = InferResponseType<typeof $request, 200>;

export const withdrawConsentMutationOptions = mutationOptions({
  mutationKey: ["consent", "withdraw"] as const,
  mutationFn: async (): Promise<WithdrawResponse> => {
    const res = await $request();
    if (!res.ok) await throwApiError(res, "Failed to withdraw consent");
    return res.json();
  },
});
