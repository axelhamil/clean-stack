import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $cancel = api.admin.approvals[":id"].cancel.$post;

export const cancelApprovalMutationOptions = mutationOptions({
  mutationKey: ["admin", "approvals", "cancel"] as const,
  mutationFn: async (id: string) => {
    const res = await $cancel({ param: { id } });
    if (!res.ok) await throwApiError(res, "cancelApproval");
  },
});
