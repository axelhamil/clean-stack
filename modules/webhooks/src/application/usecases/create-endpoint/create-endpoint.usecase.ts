import {
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  type IUseCase,
  Result,
  uuidv7,
} from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { webhookEndpointCreatedEvent } from "../../events/webhook-endpoint-created.event";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import {
  MASTER_KEY_UNAVAILABLE,
  type MasterKeyProvider,
} from "../../ports/services/master-key.port";
import type { ISecretCipher } from "../../ports/services/secret-cipher.port";
import type { ISecretGenerator } from "../../ports/services/secret-generator.port";
import type { IUrlGuard } from "../../ports/services/url-guard.port";
import type { TestDeliveryService } from "../../services/test-delivery.service";
import type {
  CreateEndpointError,
  CreateEndpointInput,
  CreateEndpointOutput,
} from "./create-endpoint.dto";

export class CreateEndpointUseCase
  implements IUseCase<CreateEndpointInput, CreateEndpointOutput, CreateEndpointError>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly testDelivery: TestDeliveryService,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly masterKey: MasterKeyProvider,
    private readonly cipher: ISecretCipher,
    private readonly secretGenerator: ISecretGenerator,
    private readonly urlGuard: IUrlGuard,
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute(
    input: CreateEndpointInput,
  ): Promise<Result<CreateEndpointOutput, CreateEndpointError>> {
    const guard = await this.urlGuard.assertPublic(input.url);
    if (guard.isFailure)
      return Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: guard.getError().message });

    const masterKey = this.masterKey();
    if (masterKey.isNone()) return Result.fail(MASTER_KEY_UNAVAILABLE);

    const plaintextSecret = this.secretGenerator.generate();
    const secretCipher = this.cipher.seal(
      plaintextSecret,
      masterKey.unwrap(),
      input.organizationId,
    );

    const created = await this.uow.run(
      async (): Promise<Result<WebhookEndpointRecord, WebhookRepoError>> => {
        const result = await this.endpoints.create({
          id: uuidv7(),
          organizationId: input.organizationId,
          url: input.url,
          secretCipher,
          eventTypes: input.eventTypes,
          enabled: input.enabled,
        });
        if (result.isFailure) return result;

        const endpoint = result.getValue();
        await emitBuiltEvent(
          this.outbox,
          webhookEndpointCreatedEvent(endpoint, input.actorUserId),
          {
            organizationId: endpoint.organizationId,
          },
        );

        return result;
      },
    );
    if (created.isFailure) return Result.fail(created.getError());

    const endpoint = created.getValue();
    await this.sendFirstTest(endpoint, input.actorUserId);

    return Result.ok({ endpoint, plaintextSecret });
  }

  private async sendFirstTest(endpoint: WebhookEndpointRecord, actorUserId: string): Promise<void> {
    await this.testDelivery
      .send({ endpointId: endpoint.id, organizationId: endpoint.organizationId, actorUserId })
      .then(
        (tested) => {
          if (tested.isFailure)
            this.logger.warn(
              { endpointId: endpoint.id, code: tested.getError().code },
              "webhook endpoint created but its test delivery failed",
            );
        },
        (err) => this.instrumentation.capture(err),
      );
  }
}
