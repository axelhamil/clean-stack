import { type IUnitOfWork, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { webhookTestEvent } from "../events/webhook-test.event";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../ports/repositories/webhook-delivery.port";
import {
  ENDPOINT_NOT_FOUND,
  type IWebhookEndpointRepository,
  type WebhookEndpointNotFound,
  type WebhookRepoError,
} from "../ports/repositories/webhook-endpoint.port";

export interface TestDeliveryRequest {
  endpointId: string;
  organizationId: string;
  actorUserId: string;
}

export type TestDeliveryError = WebhookRepoError | WebhookEndpointNotFound;

export class TestDeliveryService {
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
  ) {}

  async send(
    request: TestDeliveryRequest,
  ): Promise<Result<WebhookDeliveryRecord, TestDeliveryError>> {
    const found = await this.endpoints.findById(request.endpointId, request.organizationId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.fail(ENDPOINT_NOT_FOUND);

    return this.uow.run(async (): Promise<Result<WebhookDeliveryRecord, TestDeliveryError>> => {
      const event = webhookTestEvent(request);
      const outboxEventId = await emitBuiltEvent(this.outbox, event, {
        organizationId: request.organizationId,
      });

      return this.deliveries.enqueueTargeted({
        endpointId: request.endpointId,
        outboxEventId,
        eventType: event.type,
        payload: event.payload,
        idempotencyKey: `test:${outboxEventId}`,
      });
    });
  }
}
