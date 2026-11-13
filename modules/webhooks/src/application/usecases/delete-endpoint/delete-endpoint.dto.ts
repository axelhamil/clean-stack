import type {
  WebhookEndpointNotFound,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";

export interface DeleteEndpointInput {
  id: string;
  organizationId: string;
  actorUserId: string;
}

export type DeleteEndpointError = WebhookRepoError | WebhookEndpointNotFound;
