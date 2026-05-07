import type { ITransaction } from "../../../../shared/transaction";

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
  create(args: CreateEndpointArgs, tx?: ITransaction): Promise<WebhookEndpointRecord>;
  update(args: UpdateEndpointArgs, tx?: ITransaction): Promise<WebhookEndpointRecord | null>;
  delete(id: string, organizationId: string, tx?: ITransaction): Promise<boolean>;
  findById(id: string, organizationId: string): Promise<WebhookEndpointRecord | null>;
  listByOrg(organizationId: string): Promise<WebhookEndpointRecord[]>;
}
