import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";

const $ban = api.admin.users[":id"].ban.$post;
const $unban = api.admin.users[":id"].unban.$post;
const $revokeSessions = api.admin.users[":id"].sessions.$delete;
const $resetPassword = api.admin.users[":id"]["reset-password"].$post;
const $startImpersonation = api.admin.impersonation[":id"].start.$post;

type BanBody = InferRequestType<typeof $ban>["json"];
type StartImpersonationBody = InferRequestType<typeof $startImpersonation>["json"];

export const banUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "ban"] as const,
  mutationFn: async ({ id, ...json }: BanBody & { id: string }) => {
    const res = await $ban({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "Impossible de suspendre ce compte");
    return (await res.json()) as InferResponseType<typeof $ban, 200>;
  },
});

export const unbanUserMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "unban"] as const,
  mutationFn: async (id: string) => {
    const res = await $unban({ param: { id } });
    if (!res.ok) await throwApiError(res, "Impossible de réactiver ce compte");
    return (await res.json()) as InferResponseType<typeof $unban, 200>;
  },
});

export const revokeSessionsMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "revoke-sessions"] as const,
  mutationFn: async (id: string) => {
    const res = await $revokeSessions({ param: { id } });
    if (!res.ok) await throwApiError(res, "Impossible de révoquer les sessions");
    return (await res.json()) as InferResponseType<typeof $revokeSessions, 200>;
  },
});

export const resetPasswordMutationOptions = mutationOptions({
  mutationKey: ["admin", "users", "reset-password"] as const,
  mutationFn: async (id: string) => {
    const res = await $resetPassword({ param: { id } });
    if (!res.ok) await throwApiError(res, "Impossible d'envoyer la réinitialisation");
    return (await res.json()) as InferResponseType<typeof $resetPassword, 200>;
  },
});

export const startImpersonationMutationOptions = mutationOptions({
  mutationKey: ["admin", "impersonation", "start"] as const,
  mutationFn: async ({ id, ...json }: StartImpersonationBody & { id: string }) => {
    const res = await $startImpersonation({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "Impossible de démarrer l'impersonation");
    return (await res.json()) as InferResponseType<typeof $startImpersonation, 200>;
  },
});
