import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { webhookEndpointDeletedEvent } from "../../events/webhook-endpoint-deleted.event";
import {
  ENDPOINT_NOT_FOUND,
  type IWebhookEndpointRepository,
} from "../../ports/repositories/webhook-endpoint.port";
import type { DeleteEndpointError, DeleteEndpointInput } from "./delete-endpoint.dto";

export class DeleteEndpointUseCase
  implements IUseCase<DeleteEndpointInput, void, DeleteEndpointError>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
  ) {}

  async execute(input: DeleteEndpointInput): Promise<Result<void, DeleteEndpointError>> {
    return this.uow.run(async (): Promise<Result<void, DeleteEndpointError>> => {
      const deleted = await this.endpoints.delete(input.id, input.organizationId);
      if (deleted.isFailure) return Result.fail(deleted.getError());
      if (!deleted.getValue()) return Result.fail(ENDPOINT_NOT_FOUND);

      await emitBuiltEvent(
        this.outbox,
        webhookEndpointDeletedEvent({ ...input, endpointId: input.id }),
        { organizationId: input.organizationId },
      );

      return Result.ok();
    });
  }
}
