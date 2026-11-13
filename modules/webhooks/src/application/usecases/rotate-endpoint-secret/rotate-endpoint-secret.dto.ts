import type {
  WebhookEndpointNotFound,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import type { MasterKeyUnavailable } from "../../ports/services/master-key.port";

export interface RotateEndpointSecretInput {
  id: string;
  organizationId: string;
  actorUserId: string;
}

export interface RotateEndpointSecretOutput {
  endpoint: WebhookEndpointRecord;
  plaintextSecret: string;
}

export type RotateEndpointSecretError =
  | WebhookRepoError
  | WebhookEndpointNotFound
  | MasterKeyUnavailable;
