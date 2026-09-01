import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";

const $ban = api.admin.users[":id"].ban.$post;
const $unban = api.admin.users[":id"].unban.$post;
const $revokeSessions = api.admin.users[":id"].sessions.$delete;
const $resetPassword = api.admin.users[":id"]["reset-password"].$post;
const $startImpersonation = api.admin.impersonation[":id"].start.$post;
const $setRole = api.admin.users[":id"].role.$put;

type BanBody = InferRequestType<typeof $ban>["json"];
type StartImpersonationBody = InferRequestType<typeof $startImpersonation>["json"];
type SetRoleBody = InferRequestType<typeof $setRole>["json"];

export const banUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "ban"] as const,
  mutationFn: async ({ id, ...json }: BanBody & { id: string }) => {
    const res = await $ban({ param: { id }, json });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.banUser", { defaultValue: "Failed to suspend account" }),
      );
    return (await res.json()) as InferResponseType<typeof $ban, 200>;
  },
});

export const unbanUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "unban"] as const,
  mutationFn: async (id: string) => {
    const res = await $unban({ param: { id } });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.unbanUser", { defaultValue: "Failed to reactivate account" }),
      );
    return (await res.json()) as InferResponseType<typeof $unban, 200>;
  },
});

export const revokeSessionsMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "revoke-sessions"] as const,
  mutationFn: async (id: string) => {
    const res = await $revokeSessions({ param: { id } });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.revokeUserSessions", { defaultValue: "Failed to revoke sessions" }),
      );
    return (await res.json()) as InferResponseType<typeof $revokeSessions, 200>;
  },
});

export const resetPasswordMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "reset-password"] as const,
  mutationFn: async (id: string) => {
    const res = await $resetPassword({ param: { id } });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.resetUserPassword", {
          defaultValue: "Failed to send password reset",
        }),
      );
    return (await res.json()) as InferResponseType<typeof $resetPassword, 200>;
  },
});

export const startImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "start"] as const,
  mutationFn: async ({ id, ...json }: StartImpersonationBody & { id: string }) => {
    const res = await $startImpersonation({ param: { id }, json });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.startImpersonation", {
          defaultValue: "Failed to start impersonation",
        }),
      );
    return (await res.json()) as InferResponseType<typeof $startImpersonation, 200>;
  },
});

export const setRoleMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "set-role"] as const,
  mutationFn: async ({ id, ...json }: SetRoleBody & { id: string }) => {
    const res = await $setRole({ param: { id }, json });
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.setUserRole", { defaultValue: "Failed to change role" }),
      );
    return (await res.json()) as InferResponseType<typeof $setRole, 200>;
  },
});
