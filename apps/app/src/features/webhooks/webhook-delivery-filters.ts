// `WebhookDeliveryStatus` is not re-exported by `api/client`; define it here as a
// string-literal union matching the port definition to avoid a circular dep with
// webhooks.queries.ts (which imports DeliveryFilters from this file).
export type WebhookDeliveryStatus = "pending" | "success" | "failed" | "dead_letter";

export interface DeliveryFilters {
  status?: WebhookDeliveryStatus;
}

export function serializeDeliveryFilters(filters: DeliveryFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.status) out.status = filters.status;
  return out;
}
