import type { IQuery } from "@packages/ddd-kit";
import type { WebhookDeliveryWithAttempts } from "../ports/repositories/webhook-delivery.port";
import type {
  WebhookDeliveryNotFound,
  WebhookEndpointNotFound,
  WebhookRepoError,
} from "../ports/repositories/webhook-endpoint.port";

export interface GetDeliveryInput {
  deliveryId: string;
  endpointId: string;
  organizationId: string;
}

export type IGetDeliveryQuery = IQuery<
  GetDeliveryInput,
  WebhookDeliveryWithAttempts,
  WebhookRepoError | WebhookEndpointNotFound | WebhookDeliveryNotFound
>;
