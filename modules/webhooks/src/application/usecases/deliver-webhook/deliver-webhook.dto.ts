import type { WebhookDeliveryRecord } from "../../ports/repositories/webhook-delivery.port";

export interface DeliverWebhookInput {
  delivery: WebhookDeliveryRecord;
}
