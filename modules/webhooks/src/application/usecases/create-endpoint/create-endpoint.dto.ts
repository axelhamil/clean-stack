import type {
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import type { MasterKeyUnavailable } from "../../ports/services/master-key.port";
import type { WebhookUrlForbidden } from "../../ports/services/url-guard.port";

export interface CreateEndpointInput {
  organizationId: string;
  actorUserId: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
}

export interface CreateEndpointOutput {
  endpoint: WebhookEndpointRecord;
  plaintextSecret: string;
}

export type CreateEndpointError = WebhookRepoError | MasterKeyUnavailable | WebhookUrlForbidden;
