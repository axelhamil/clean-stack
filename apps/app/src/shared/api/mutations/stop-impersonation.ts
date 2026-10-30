import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";

const $stop = api.admin.impersonation.stop.$post;

export const stopImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "stop"] as const,
  mutationFn: async () => {
    const res = await $stop();
    if (!res.ok) await throwApiError(res, "stopImpersonation");
    return (await res.json()) as InferResponseType<typeof $stop, 200>;
  },
});
