import type { AppError, Option, Result } from "@packages/ddd-kit";

export type WebhookRepoError = AppError<"WEBHOOK_PERSISTENCE_PROVIDER_FAILURE">;

export type WebhookEndpointNotFound = AppError<"WEBHOOK_ENDPOINT_NOT_FOUND">;
export type WebhookDeliveryNotFound = AppError<"WEBHOOK_DELIVERY_NOT_FOUND">;

export const ENDPOINT_NOT_FOUND: WebhookEndpointNotFound = {
  code: "WEBHOOK_ENDPOINT_NOT_FOUND",
  message: "Webhook endpoint not found",
};

export const DELIVERY_NOT_FOUND: WebhookDeliveryNotFound = {
  code: "WEBHOOK_DELIVERY_NOT_FOUND",
  message: "Webhook delivery not found",
};

export type WebhookEndpointRecord = {
  id: string;
  organizationId: string;
  url: string;
  secretCipher: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  previousSecretCipher: Option<string>;
  previousSecretExpiresAt: Option<Date>;
  consecutiveFailures: number;
  firstFailedAt: Option<Date>;
  disabledAt: Option<Date>;
};

export type CreateEndpointArgs = {
  id: string;
  organizationId: string;
  url: string;
  secretCipher: string;
  eventTypes: string[];
  enabled: boolean;
};

export type UpdateEndpointArgs = {
  id: string;
  organizationId: string;
  url?: string;
  eventTypes?: string[];
  enabled?: boolean;
};

export type SecretRotation = {
  id: string;
  organizationId: string;
  secretCipher: string;
  previousSecretCipher: string;
  previousSecretExpiresAt: Date;
};

export type EndpointFailureStreak = {
  consecutiveFailures: number;
  firstFailedAt: Date;
};

export type SubscribedEndpoint = Pick<WebhookEndpointRecord, "id" | "eventTypes">;

export interface IWebhookEndpointRepository {
  create(args: CreateEndpointArgs): Promise<Result<WebhookEndpointRecord, WebhookRepoError>>;
  update(
    args: UpdateEndpointArgs,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>>;
  delete(id: string, organizationId: string): Promise<Result<boolean, WebhookRepoError>>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>>;
  findEnabledById(id: string): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>>;
  listEnabledByOrg(organizationId: string): Promise<Result<SubscribedEndpoint[], WebhookRepoError>>;
  applySecretRotation(
    rotation: SecretRotation,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>>;
  bumpFailure(
    id: string,
    organizationId: string,
  ): Promise<Result<Option<EndpointFailureStreak>, WebhookRepoError>>;
  resetFailure(id: string, organizationId: string): Promise<Result<void, WebhookRepoError>>;
  markDisabled(
    id: string,
    organizationId: string,
    disabledAt: Date,
  ): Promise<Result<void, WebhookRepoError>>;
}
