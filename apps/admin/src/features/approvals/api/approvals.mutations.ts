import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { ADMIN_QUERY_SCOPES } from "../../../shared/api/admin-query-scopes";
import { api } from "../../../shared/api/api-client";

const $decide = api.admin.approvals[":id"].decide.$post;

type DecideBody = Parameters<typeof $decide>[0]["json"];

export function refreshAfterDecision(queryClient: QueryClient): void {
  for (const queryKey of ADMIN_QUERY_SCOPES) void queryClient.invalidateQueries({ queryKey });
}

export const decideApprovalMutationOptions = mutationOptions({
  mutationKey: ["admin", "approvals", "decide"] as const,
  mutationFn: async ({ id, ...json }: DecideBody & { id: string }) => {
    const res = await $decide({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "decideApproval");
  },
});
