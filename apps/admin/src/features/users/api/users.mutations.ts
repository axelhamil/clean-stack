import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import { approvalIdOf } from "../../../shared/api/approval-outcome";

const $ban = api.admin.users[":id"].ban.$post;
const $unban = api.admin.users[":id"].unban.$post;
const $revokeSessions = api.admin.users[":id"].sessions.$delete;
const $resetPassword = api.admin.users[":id"]["reset-password"].$post;
const $startImpersonation = api.admin.impersonation[":id"].start.$post;

type BanBody = Parameters<typeof $ban>[0]["json"];
type ImpersonationBody = Parameters<typeof $startImpersonation>[0]["json"];

export const banUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "ban"] as const,
  mutationFn: async ({ id, ...json }: BanBody & { id: string }) => {
    const res = await $ban({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "banUser");

    return approvalIdOf(res);
  },
});

export const unbanUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "unban"] as const,
  mutationFn: async (id: string) => {
    const res = await $unban({ param: { id } });
    if (!res.ok) await throwApiError(res, "unbanUser");
  },
});

export const revokeSessionsMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "revoke-sessions"] as const,
  mutationFn: async (id: string) => {
    const res = await $revokeSessions({ param: { id } });
    if (!res.ok) await throwApiError(res, "revokeUserSessions");
  },
});

export const resetPasswordMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "reset-password"] as const,
  mutationFn: async (id: string) => {
    const res = await $resetPassword({ param: { id } });
    if (!res.ok) await throwApiError(res, "resetUserPassword");
  },
});

export const startImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "start"] as const,
  mutationFn: async ({ id, ...json }: ImpersonationBody & { id: string }) => {
    const res = await $startImpersonation({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "startImpersonation");
  },
});
