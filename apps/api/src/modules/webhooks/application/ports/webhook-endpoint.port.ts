import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../../../../shared/transaction";

export type WebhookRepoError = AppError<"WEBHOOK_PERSISTENCE_PROVIDER_FAILURE">;

export type WebhookEndpointRecord = {
  id: string;
  organizationId: string;
  url: string;
  secretCipher: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  previousSecretCipher: string | null;
  previousSecretExpiresAt: Date | null;
  consecutiveFailures: number;
  firstFailedAt: Date | null;
  disabledAt: Date | null;
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

export interface IWebhookEndpointRepository {
  create(
    args: CreateEndpointArgs,
    tx?: ITransaction,
  ): Promise<Result<WebhookEndpointRecord, WebhookRepoError>>;
  update(
    args: UpdateEndpointArgs,
    tx?: ITransaction,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>>;
  delete(
    id: string,
    organizationId: string,
    tx?: ITransaction,
  ): Promise<Result<boolean, WebhookRepoError>>;
  findById(id: string, organizationId: string): Promise<Option<WebhookEndpointRecord>>;
  listByOrg(organizationId: string): Promise<Result<WebhookEndpointRecord[], WebhookRepoError>>;
  applySecretRotation(
    args: {
      id: string;
      organizationId: string;
      secretCipher: string;
      previousSecretCipher: string;
      previousSecretExpiresAt: Date;
    },
    tx: ITransaction,
  ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>>;
  bumpFailure(
    id: string,
    tx: ITransaction,
  ): Promise<
    Result<Option<{ consecutiveFailures: number; firstFailedAt: Date }>, WebhookRepoError>
  >;
  resetFailure(id: string, tx: ITransaction): Promise<Result<void, WebhookRepoError>>;
  markDisabled(
    id: string,
    disabledAt: Date,
    tx: ITransaction,
  ): Promise<Result<void, WebhookRepoError>>;
}
