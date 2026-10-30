import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../api-client";

const $request = api.consents.$post;

type RequestBody = InferRequestType<typeof $request>["json"];
type RecordResponse = InferResponseType<typeof $request, 200>;

async function recordConsentFn(input: RequestBody): Promise<RecordResponse> {
  const res = await $request({ json: input });
  if (!res.ok) await throwApiError(res, "recordConsent");
  return res.json();
}

export const recordConsentMutationOptions = mutationOptions({
  mutationKey: ["consent", "record"] as const,
  mutationFn: recordConsentFn,
});
