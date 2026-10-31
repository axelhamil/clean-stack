import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $requeue = api.admin.ops.outbox.requeue.$post;
const $replay = api.admin.ops["stripe-events"][":id"].replay.$post;

export const OPS_QUERY_KEY = ["admin", "ops"] as const;

export const requeueOutboxMutationOptions = mutationOptions({
  mutationKey: ["admin", "ops", "requeue"] as const,
  mutationFn: async (ids: string[]) => {
    const res = await $requeue({ json: { ids } });
    if (!res.ok) await throwApiError(res, "requeueOutbox");

    return res.json();
  },
});

export const replayStripeEventMutationOptions = mutationOptions({
  mutationKey: ["admin", "ops", "replay"] as const,
  mutationFn: async (id: string) => {
    const res = await $replay({ param: { id } });
    if (!res.ok) await throwApiError(res, "replayStripeEvent");
  },
});
