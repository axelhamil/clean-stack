import type { IQuery, Option } from "@packages/ddd-kit";
import type {
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
} from "../ports/repositories/webhook-delivery.port";
import type {
  WebhookEndpointNotFound,
  WebhookRepoError,
} from "../ports/repositories/webhook-endpoint.port";

export interface ListDeliveriesInput {
  endpointId: string;
  organizationId: string;
  status?: WebhookDeliveryStatus;
  limit?: number;
  cursor?: string;
}

export type DeliveryPage = {
  items: WebhookDeliveryRecord[];
  nextCursor: Option<string>;
};

export type IListDeliveriesQuery = IQuery<
  ListDeliveriesInput,
  DeliveryPage,
  WebhookRepoError | WebhookEndpointNotFound
>;
