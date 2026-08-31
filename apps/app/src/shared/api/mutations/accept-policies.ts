import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $request = api.me.policies.accept.$post;

type RequestBody = InferRequestType<typeof $request>["json"];
type AcceptResponse = InferResponseType<typeof $request, 200>;

export const acceptPoliciesMutationOptions = mutationOptions({
  mutationKey: ["policies", "accept"] as const,
  mutationFn: async (input: RequestBody): Promise<AcceptResponse> => {
    const res = await $request({ json: input });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.acceptPolicies", { defaultValue: "Failed to accept policies" }),
      );
    return res.json();
  },
});
