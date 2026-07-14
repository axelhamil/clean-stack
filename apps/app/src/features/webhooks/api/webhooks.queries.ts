import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";
import { type DeliveryFilters, serializeDeliveryFilters } from "../webhook-delivery-filters";

const $listEndpoints = api.settings.webhooks.$get;
const $listDeliveries = api.settings.webhooks[":id"].deliveries.$get;
const $deliveryDetail = api.settings.webhooks[":id"].deliveries[":deliveryId"].$get;

export type WebhookEndpointsResponse = InferResponseType<typeof $listEndpoints, 200>;
export type WebhookEndpoint = WebhookEndpointsResponse["items"][number];

export type DeliveriesPage = InferResponseType<typeof $listDeliveries, 200>;
export type DeliveryListItem = DeliveriesPage["items"][number];
export type WebhookDeliveryStatus = DeliveryListItem["status"];

export type DeliveryDetail = InferResponseType<typeof $deliveryDetail, 200>;
export type DeliveryAttempt = DeliveryDetail["attemptHistory"][number];

export const webhookEndpointsQueryOptions = () =>
  queryOptions({
    queryKey: ["settings", "webhooks", "endpoints"] as const,
    queryFn: async ({ signal }) => {
      const res = await $listEndpoints({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "Failed to load webhook endpoints");
      return (await res.json()) as WebhookEndpointsResponse;
    },
  });

export const webhookDeliveriesInfiniteQueryOptions = (
  endpointId: string,
  filters: DeliveryFilters,
) =>
  infiniteQueryOptions({
    queryKey: ["settings", "webhooks", endpointId, "deliveries", filters] as const,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $listDeliveries(
        {
          param: { id: endpointId },
          query: {
            ...serializeDeliveryFilters(filters),
            limit: "50",
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "Failed to load deliveries");
      return (await res.json()) as DeliveriesPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const webhookDeliveryDetailQueryOptions = (endpointId: string, deliveryId: string) =>
  queryOptions({
    queryKey: ["settings", "webhooks", endpointId, "deliveries", deliveryId] as const,
    queryFn: async ({ signal }) => {
      const res = await $deliveryDetail(
        { param: { id: endpointId, deliveryId } },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "Failed to load delivery detail");
      return (await res.json()) as DeliveryDetail;
    },
  });
