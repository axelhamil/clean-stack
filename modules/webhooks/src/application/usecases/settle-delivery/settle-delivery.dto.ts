import type { WebhookDeliveryRecord } from "../../ports/repositories/webhook-delivery.port";
import type { DeliveryOutcome } from "../../services/delivery-policy.service";

export interface SettleDeliveryInput {
  delivery: WebhookDeliveryRecord;
  outcome: DeliveryOutcome;
}

export interface SettleDeliveryOutput {
  written: boolean;
}
