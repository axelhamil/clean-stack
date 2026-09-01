import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $request = api.me.delete.$post;

type RequestBody = InferRequestType<typeof $request>["json"];
type RequestResponse = InferResponseType<typeof $request, 200>;

export const requestAccountDeletionMutationOptions = mutationOptions({
  mutationKey: ["account-deletion", "request"] as const,
  mutationFn: async (input: RequestBody): Promise<RequestResponse> => {
    const res = await $request({ json: input });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.requestAccountDeletion", {
          defaultValue: "Account deletion failed",
        }),
      );
    return res.json();
  },
});
