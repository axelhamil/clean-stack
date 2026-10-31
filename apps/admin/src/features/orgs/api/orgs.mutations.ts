import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import type { PlanOverrideFormValues } from "../components/plan-override-form";

const $set = api.admin.orgs[":id"]["sso-enforcement"].$post;
const $setPlanOverride = api.admin.orgs[":id"]["plan-override"].$post;
const $revokePlanOverride = api.admin.orgs[":id"]["plan-override"].$delete;

export const setSsoEnforcementMutationOptions = mutationOptions({
  mutationKey: ["admin", "orgs", "sso-enforcement"] as const,
  mutationFn: async ({ id, enforced }: { id: string; enforced: boolean }) => {
    const res = await $set({ param: { id }, json: { enforced } });
    if (!res.ok) await throwApiError(res, "updateAdminOrgSsoEnforcement");
  },
});

export const setPlanOverrideMutationOptions = mutationOptions({
  mutationKey: ["admin", "orgs", "plan-override", "set"] as const,
  mutationFn: async ({ id, ...json }: PlanOverrideFormValues & { id: string }) => {
    const res = await $setPlanOverride({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "setPlanOverride");
  },
});

export const revokePlanOverrideMutationOptions = mutationOptions({
  mutationKey: ["admin", "orgs", "plan-override", "revoke"] as const,
  mutationFn: async (id: string) => {
    const res = await $revokePlanOverride({ param: { id } });
    if (!res.ok) await throwApiError(res, "revokePlanOverride");
  },
});
