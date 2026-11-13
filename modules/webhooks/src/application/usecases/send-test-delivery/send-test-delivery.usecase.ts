import type { IUseCase, Result } from "@packages/ddd-kit";
import type { WebhookDeliveryRecord } from "../../ports/repositories/webhook-delivery.port";
import type { TestDeliveryError, TestDeliveryService } from "../../services/test-delivery.service";
import type { SendTestDeliveryInput } from "./send-test-delivery.dto";

export class SendTestDeliveryUseCase
  implements IUseCase<SendTestDeliveryInput, WebhookDeliveryRecord, TestDeliveryError>
{
  constructor(private readonly testDelivery: TestDeliveryService) {}

  async execute(
    input: SendTestDeliveryInput,
  ): Promise<Result<WebhookDeliveryRecord, TestDeliveryError>> {
    return this.testDelivery.send({
      endpointId: input.id,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });
  }
}
