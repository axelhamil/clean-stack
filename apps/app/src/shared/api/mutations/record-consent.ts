import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $request = api.consents.$post;

type RequestBody = InferRequestType<typeof $request>["json"];
type RecordResponse = InferResponseType<typeof $request, 200>;

async function recordConsentFn(input: RequestBody): Promise<RecordResponse> {
  const res = await $request({ json: input });
  if (!res.ok)
    await throwApiError(
      res,
      getErrorsT()("fallback.recordConsent", { defaultValue: "Failed to record consent" }),
    );
  return res.json();
}

export const recordConsentMutationOptions = mutationOptions({
  mutationKey: ["consent", "record"] as const,
  mutationFn: recordConsentFn,
});
