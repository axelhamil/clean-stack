import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";

const $ban = api.admin.users[":id"].ban.$post;
const $unban = api.admin.users[":id"].unban.$post;
const $role = api.admin.users[":id"].role.$put;
const $resetPassword = api.admin.users[":id"]["reset-password"].$post;
const $revokeSessions = api.admin.users[":id"].sessions.$delete;
const $startImpersonation = api.admin.impersonation[":id"].start.$post;
const $stopImpersonation = api.admin.impersonation.stop.$post;

export type BanUserBody = InferRequestType<typeof $ban>["json"];
export type SetRoleBody = InferRequestType<typeof $role>["json"];
export type StartImpersonationBody = InferRequestType<typeof $startImpersonation>["json"];

export const banUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "ban"] as const,
  mutationFn: async ({ id, ...json }: BanUserBody & { id: string }) => {
    const res = await $ban({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "Impossible de suspendre le compte");
    return res.json();
  },
});

export const unbanUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "unban"] as const,
  mutationFn: async ({ id }: { id: string }) => {
    const res = await $unban({ param: { id } });
    if (!res.ok) await throwApiError(res, "Impossible de réactiver le compte");
    return res.json();
  },
});

export const setUserRoleMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "set-role"] as const,
  mutationFn: async ({ id, ...json }: SetRoleBody & { id: string }) => {
    const res = await $role({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "Impossible de modifier le rôle");
    return res.json();
  },
});

export const resetUserPasswordMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "reset-password"] as const,
  mutationFn: async ({ id }: { id: string }) => {
    const res = await $resetPassword({ param: { id } });
    if (!res.ok) await throwApiError(res, "Impossible de réinitialiser le mot de passe");
    return res.json();
  },
});

export const revokeUserSessionsMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "revoke-sessions"] as const,
  mutationFn: async ({ id }: { id: string }) => {
    const res = await $revokeSessions({ param: { id } });
    if (!res.ok) await throwApiError(res, "Impossible de révoquer les sessions");
    return res.json();
  },
});

export const startImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "start"] as const,
  mutationFn: async ({ id, ...json }: StartImpersonationBody & { id: string }) => {
    const res = await $startImpersonation({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "Impossible de démarrer l'impersonation");
    return res.json();
  },
});

export const stopImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "stop"] as const,
  mutationFn: async () => {
    const res = await $stopImpersonation();
    if (!res.ok) await throwApiError(res, "Impossible de quitter l'impersonation");
    return res.json();
  },
});
