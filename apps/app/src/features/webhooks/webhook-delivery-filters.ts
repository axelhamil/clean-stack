import type { WebhookDeliveryStatus } from "./api/webhooks.queries";

export interface DeliveryFilters {
  status?: WebhookDeliveryStatus;
}

export function serializeDeliveryFilters(filters: DeliveryFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.status) out.status = filters.status;

  return out;
}
