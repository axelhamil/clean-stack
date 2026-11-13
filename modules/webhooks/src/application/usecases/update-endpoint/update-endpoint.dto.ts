import type {
  WebhookEndpointNotFound,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import type { WebhookUrlForbidden } from "../../ports/services/url-guard.port";

export interface UpdateEndpointInput {
  id: string;
  organizationId: string;
  actorUserId: string;
  url?: string;
  eventTypes?: string[];
  enabled?: boolean;
}

export type UpdateEndpointError = WebhookRepoError | WebhookEndpointNotFound | WebhookUrlForbidden;
