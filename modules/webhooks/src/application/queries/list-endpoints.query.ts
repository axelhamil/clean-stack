import type { IQuery } from "@packages/ddd-kit";
import type {
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../ports/repositories/webhook-endpoint.port";

export interface ListEndpointsInput {
  organizationId: string;
}

export type IListEndpointsQuery = IQuery<
  ListEndpointsInput,
  WebhookEndpointRecord[],
  WebhookRepoError
>;
