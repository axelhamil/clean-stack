import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";

const $create = api.settings.tokens.$post;
const $delete = api.settings.tokens[":id"].$delete;

export type CreateTokenBody = InferRequestType<typeof $create>["json"];
export type CreateTokenResponse = InferResponseType<typeof $create, 201>;

export const createTokenMutationOptions = mutationOptions({
  mutationKey: ["settings", "api-tokens", "create"] as const,
  mutationFn: async (input: CreateTokenBody) => {
    const res = await $create({ json: input });
    if (!res.ok) await throwApiError(res, "Failed to create API token");
    return (await res.json()) as CreateTokenResponse;
  },
});

export const deleteTokenMutationOptions = mutationOptions({
  mutationKey: ["settings", "api-tokens", "delete"] as const,
  mutationFn: async (id: string) => {
    const res = await $delete({ param: { id } });
    if (!res.ok) await throwApiError(res, "Failed to revoke API token");
    return (await res.json()) as InferResponseType<typeof $delete, 200>;
  },
});
