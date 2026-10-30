import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $decide = api.admin.approvals[":id"].decide.$post;

type DecideBody = Parameters<typeof $decide>[0]["json"];

export const decideApprovalMutationOptions = mutationOptions({
  mutationKey: ["admin", "approvals", "decide"] as const,
  mutationFn: async ({ id, ...json }: DecideBody & { id: string }) => {
    const res = await $decide({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "decideApproval");
  },
});
