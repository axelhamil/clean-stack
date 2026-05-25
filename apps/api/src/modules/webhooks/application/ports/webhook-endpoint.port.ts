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
  update(args: UpdateEndpointArgs, tx?: ITransaction): Promise<Option<WebhookEndpointRecord>>;
  delete(id: string, organizationId: string, tx?: ITransaction): Promise<boolean>;
  findById(id: string, organizationId: string): Promise<Option<WebhookEndpointRecord>>;
  listByOrg(organizationId: string): Promise<WebhookEndpointRecord[]>;
}
