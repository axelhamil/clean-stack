import { type IUnitOfWork, type IUseCase, type Option, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { webhookDeliveryReplayedEvent } from "../../events/webhook-delivery-replayed.event";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../ports/repositories/webhook-delivery.port";
import {
  DELIVERY_NOT_FOUND,
  ENDPOINT_NOT_FOUND,
  type IWebhookEndpointRepository,
  type WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import type { ReplayDeliveryError, ReplayDeliveryInput } from "./replay-delivery.dto";

export class ReplayDeliveryUseCase
  implements IUseCase<ReplayDeliveryInput, WebhookDeliveryRecord, ReplayDeliveryError>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
  ) {}

  async execute(
    input: ReplayDeliveryInput,
  ): Promise<Result<WebhookDeliveryRecord, ReplayDeliveryError>> {
    const endpoint = await this.endpoints.findById(input.endpointId, input.organizationId);
    if (endpoint.isFailure) return Result.fail(endpoint.getError());
    if (endpoint.getValue().isNone()) return Result.fail(ENDPOINT_NOT_FOUND);

    const replayed = await this.uow.run(
      async (): Promise<Result<Option<WebhookDeliveryRecord>, WebhookRepoError>> => {
        const result = await this.deliveries.enqueueReplay(
          input.deliveryId,
          input.endpointId,
          input.organizationId,
        );
        if (result.isFailure) return result;

        const replay = result.getValue();
        if (replay.isNone()) return result;

        await emitBuiltEvent(
          this.outbox,
          webhookDeliveryReplayedEvent({ ...input, replayedDeliveryId: replay.unwrap().id }),
          { organizationId: input.organizationId },
        );

        return result;
      },
    );
    if (replayed.isFailure) return Result.fail(replayed.getError());

    const replay = replayed.getValue();
    if (replay.isNone()) return Result.fail(DELIVERY_NOT_FOUND);

    return Result.ok(replay.unwrap());
  }
}
