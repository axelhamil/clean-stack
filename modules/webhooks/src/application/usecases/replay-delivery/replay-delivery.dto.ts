import type {
  WebhookDeliveryNotFound,
  WebhookEndpointNotFound,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";

export interface ReplayDeliveryInput {
  deliveryId: string;
  endpointId: string;
  organizationId: string;
  actorUserId: string;
}

export type ReplayDeliveryError =
  | WebhookRepoError
  | WebhookEndpointNotFound
  | WebhookDeliveryNotFound;
