import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import { approvalIdOf } from "../../../shared/api/approval-outcome";

const $setRole = api.admin.staff[":id"].role.$put;
const $revoke = api.admin.staff[":id"].$delete;
const $setOverride = api.admin.staff[":id"].overrides.$post;
const $removeOverride = api.admin.staff[":id"].overrides[":overrideId"].$delete;

type RoleBody = Parameters<typeof $setRole>[0]["json"];
type OverrideBody = Parameters<typeof $setOverride>[0]["json"];

export const setStaffRoleMutationOptions = mutationOptions({
  mutationKey: ["admin", "staff", "set-role"] as const,
  mutationFn: async ({ id, ...json }: RoleBody & { id: string }) => {
    const res = await $setRole({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "setStaffRole");

    return approvalIdOf(res);
  },
});

export const revokeStaffMutationOptions = mutationOptions({
  mutationKey: ["admin", "staff", "revoke"] as const,
  mutationFn: async (id: string) => {
    const res = await $revoke({ param: { id } });
    if (!res.ok) await throwApiError(res, "revokeStaff");

    return approvalIdOf(res);
  },
});

export const setStaffOverrideMutationOptions = mutationOptions({
  mutationKey: ["admin", "staff", "set-override"] as const,
  mutationFn: async ({ id, ...json }: OverrideBody & { id: string }) => {
    const res = await $setOverride({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "setStaffOverride");

    return approvalIdOf(res);
  },
});

export const removeStaffOverrideMutationOptions = mutationOptions({
  mutationKey: ["admin", "staff", "remove-override"] as const,
  mutationFn: async ({ id, overrideId }: { id: string; overrideId: string }) => {
    const res = await $removeOverride({ param: { id, overrideId } });
    if (!res.ok) await throwApiError(res, "removeStaffOverride");

    return approvalIdOf(res);
  },
});
