import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $request = api.me.delete.$post;

type RequestBody = InferRequestType<typeof $request>["json"];
type RequestResponse = InferResponseType<typeof $request, 200>;

export const requestAccountDeletionMutationOptions = mutationOptions({
  mutationKey: ["account-deletion", "request"] as const,
  mutationFn: async (input: RequestBody): Promise<RequestResponse> => {
    const res = await $request({ json: input });
    if (!res.ok) await throwApiError(res, "Account deletion failed");
    return res.json();
  },
});
