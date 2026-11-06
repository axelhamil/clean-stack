import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
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

export const webhookEndpointsQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: ["settings", "webhooks", organizationId, "endpoints"] as const,
    enabled: organizationId !== null,
    queryFn: async ({ signal }): Promise<WebhookEndpointsResponse> => {
      const res = await $listEndpoints({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadWebhookEndpoints");
      return res.json();
    },
  });

export const webhookDeliveriesInfiniteQueryOptions = (
  organizationId: string | null,
  endpointId: string,
  filters: DeliveryFilters,
) =>
  infiniteQueryOptions({
    queryKey: ["settings", "webhooks", organizationId, endpointId, "deliveries", filters] as const,
    enabled: organizationId !== null && endpointId !== "",
    queryFn: async ({ pageParam, signal }): Promise<DeliveriesPage> => {
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
      if (!res.ok) await throwApiError(res, "loadWebhookDeliveries");
      return res.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (last: DeliveriesPage): string | undefined => last.nextCursor ?? undefined,
  });

export const webhookDeliveryDetailQueryOptions = (
  organizationId: string | null,
  endpointId: string,
  deliveryId: string,
) =>
  queryOptions({
    queryKey: [
      "settings",
      "webhooks",
      organizationId,
      endpointId,
      "deliveries",
      deliveryId,
    ] as const,
    enabled: organizationId !== null && deliveryId !== "",
    queryFn: async ({ signal }): Promise<DeliveryDetail> => {
      const res = await $deliveryDetail(
        { param: { id: endpointId, deliveryId } },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadWebhookDeliveryDetail");
      return res.json();
    },
  });
