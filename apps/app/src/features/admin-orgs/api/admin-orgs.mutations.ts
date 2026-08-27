import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";

const $setSsoEnforcement = api.admin.orgs[":id"]["sso-enforcement"].$post;

export const setOrgSsoEnforcementMutationOptions = mutationOptions({
  mutationKey: ["admin", "orgs", "sso-enforcement"] as const,
  mutationFn: async ({ id, enforced }: { id: string; enforced: boolean }) => {
    const res = await $setSsoEnforcement({ param: { id }, json: { enforced } });
    if (!res.ok) await throwApiError(res, "Failed to update SSO enforcement");
    return (await res.json()) as InferResponseType<typeof $setSsoEnforcement, 200>;
  },
});
