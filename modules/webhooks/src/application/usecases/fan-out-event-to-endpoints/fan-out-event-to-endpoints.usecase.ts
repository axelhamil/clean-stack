import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { isKnownEventType, isPublicEvent, matchesSubscription } from "@packages/events";
import type { IWebhookDeliveryRepository } from "../../ports/repositories/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import type { FanOutEventToEndpointsInput } from "./fan-out-event-to-endpoints.dto";

export class FanOutEventToEndpointsUseCase
  implements IUseCase<FanOutEventToEndpointsInput, void, WebhookRepoError>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  async execute(input: FanOutEventToEndpointsInput): Promise<Result<void, WebhookRepoError>> {
    const { eventId, eventType, payload } = input;
    if (input.organizationId.isNone()) return Result.ok();
    if (!isKnownEventType(eventType) || !isPublicEvent(eventType)) return Result.ok();

    const organizationId = input.organizationId.unwrap();

    return this.uow.run(async (): Promise<Result<void, WebhookRepoError>> => {
      const enabled = await this.endpoints.listEnabledByOrg(organizationId);
      if (enabled.isFailure) return Result.fail(enabled.getError());

      const subscribed = enabled
        .getValue()
        .filter((endpoint) => matchesSubscription(eventType, endpoint.eventTypes));
      if (subscribed.length === 0) return Result.ok();

      return this.deliveries.enqueueFanout(
        subscribed.map((endpoint) => ({
          endpointId: endpoint.id,
          outboxEventId: eventId,
          eventType,
          payload,
          idempotencyKey: `${eventId}:${endpoint.id}`,
        })),
      );
    });
  }
}
