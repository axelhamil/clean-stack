import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $stop = api.admin.impersonation.stop.$post;

export const stopImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "stop"] as const,
  mutationFn: async () => {
    const res = await $stop();
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.stopImpersonation", {
          defaultValue: "Failed to stop impersonation",
        }),
      );
    return (await res.json()) as InferResponseType<typeof $stop, 200>;
  },
});
