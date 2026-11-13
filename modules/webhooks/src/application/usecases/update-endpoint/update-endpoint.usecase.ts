import { type IUnitOfWork, type IUseCase, type Option, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { webhookEndpointUpdatedEvent } from "../../events/webhook-endpoint-updated.event";
import {
  ENDPOINT_NOT_FOUND,
  type IWebhookEndpointRepository,
  type WebhookEndpointRecord,
  type WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import type { IUrlGuard } from "../../ports/services/url-guard.port";
import type { UpdateEndpointError, UpdateEndpointInput } from "./update-endpoint.dto";

export class UpdateEndpointUseCase
  implements IUseCase<UpdateEndpointInput, WebhookEndpointRecord, UpdateEndpointError>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly urlGuard: IUrlGuard,
  ) {}

  async execute(
    input: UpdateEndpointInput,
  ): Promise<Result<WebhookEndpointRecord, UpdateEndpointError>> {
    if (input.url !== undefined) {
      const guard = await this.urlGuard.assertPublic(input.url);
      if (guard.isFailure)
        return Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: guard.getError().message });
    }

    const updated = await this.uow.run(
      async (): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> => {
        const result = await this.endpoints.update(input);
        if (result.isFailure || result.getValue().isNone()) return result;

        await emitBuiltEvent(
          this.outbox,
          webhookEndpointUpdatedEvent({ ...input, endpointId: input.id }),
          { organizationId: input.organizationId },
        );

        return result;
      },
    );
    if (updated.isFailure) return Result.fail(updated.getError());

    const endpoint = updated.getValue();
    if (endpoint.isNone()) return Result.fail(ENDPOINT_NOT_FOUND);

    return Result.ok(endpoint.unwrap());
  }
}
