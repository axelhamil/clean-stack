import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";

const $create = api.settings.webhooks.$post;
const $update = api.settings.webhooks[":id"].$patch;
const $delete = api.settings.webhooks[":id"].$delete;
const $replay = api.settings.webhooks[":id"].deliveries[":deliveryId"].replay.$post;
const $rotate = api.settings.webhooks[":id"]["rotate-secret"].$post;
const $test = api.settings.webhooks[":id"].test.$post;

export type CreateEndpointBody = InferRequestType<typeof $create>["json"];
export type CreateEndpointResponse = InferResponseType<typeof $create, 201>;
export type UpdateEndpointBody = InferRequestType<typeof $update>["json"];
export type RotateSecretResponse = InferResponseType<typeof $rotate, 200>;

export const createEndpointMutationOptions = mutationOptions({
  mutationKey: ["settings", "webhooks", "create"] as const,
  mutationFn: async (input: CreateEndpointBody) => {
    const res = await $create({ json: input });
    if (!res.ok) await throwApiError(res, "Failed to create webhook endpoint");
    return (await res.json()) as CreateEndpointResponse;
  },
});

export const updateEndpointMutationOptions = mutationOptions({
  mutationKey: ["settings", "webhooks", "update"] as const,
  mutationFn: async ({ id, ...json }: UpdateEndpointBody & { id: string }) => {
    const res = await $update({ param: { id }, json });
    if (!res.ok) await throwApiError(res, "Failed to update webhook endpoint");
    return (await res.json()) as InferResponseType<typeof $update, 200>;
  },
});

export const deleteEndpointMutationOptions = mutationOptions({
  mutationKey: ["settings", "webhooks", "delete"] as const,
  mutationFn: async (id: string) => {
    const res = await $delete({ param: { id } });
    if (!res.ok) await throwApiError(res, "Failed to delete webhook endpoint");
    return (await res.json()) as InferResponseType<typeof $delete, 200>;
  },
});

export const replayDeliveryMutationOptions = mutationOptions({
  mutationKey: ["settings", "webhooks", "replay"] as const,
  mutationFn: async ({ endpointId, deliveryId }: { endpointId: string; deliveryId: string }) => {
    const res = await $replay({ param: { id: endpointId, deliveryId } });
    if (!res.ok) await throwApiError(res, "Failed to replay delivery");
    return (await res.json()) as InferResponseType<typeof $replay, 201>;
  },
});

export const rotateSecretMutationOptions = mutationOptions({
  mutationKey: ["settings", "webhooks", "rotate"] as const,
  mutationFn: async (id: string) => {
    const res = await $rotate({ param: { id } });
    if (!res.ok) await throwApiError(res, "Failed to rotate secret");
    return (await res.json()) as RotateSecretResponse;
  },
});

export const sendTestMutationOptions = mutationOptions({
  mutationKey: ["settings", "webhooks", "test"] as const,
  mutationFn: async (id: string) => {
    const res = await $test({ param: { id } });
    if (!res.ok) await throwApiError(res, "Failed to send test event");
    return res.json();
  },
});
