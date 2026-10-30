import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $set = api.admin.orgs[":id"]["sso-enforcement"].$post;

export const setSsoEnforcementMutationOptions = mutationOptions({
  mutationKey: ["admin", "orgs", "sso-enforcement"] as const,
  mutationFn: async ({ id, enforced }: { id: string; enforced: boolean }) => {
    const res = await $set({ param: { id }, json: { enforced } });
    if (!res.ok) await throwApiError(res, "updateAdminOrgSsoEnforcement");
  },
});
