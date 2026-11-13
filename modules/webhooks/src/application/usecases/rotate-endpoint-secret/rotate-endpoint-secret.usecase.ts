import { type IUnitOfWork, type IUseCase, type Option, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { WebhookSettings } from "../../config/webhook-settings";
import { webhookEndpointSecretRotatedEvent } from "../../events/webhook-endpoint-secret-rotated.event";
import {
  ENDPOINT_NOT_FOUND,
  type IWebhookEndpointRepository,
  type WebhookEndpointRecord,
  type WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import {
  MASTER_KEY_UNAVAILABLE,
  type MasterKeyProvider,
} from "../../ports/services/master-key.port";
import type { ISecretCipher } from "../../ports/services/secret-cipher.port";
import type { ISecretGenerator } from "../../ports/services/secret-generator.port";
import type {
  RotateEndpointSecretError,
  RotateEndpointSecretInput,
  RotateEndpointSecretOutput,
} from "./rotate-endpoint-secret.dto";

export class RotateEndpointSecretUseCase
  implements
    IUseCase<RotateEndpointSecretInput, RotateEndpointSecretOutput, RotateEndpointSecretError>
{
  constructor(
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly masterKey: MasterKeyProvider,
    private readonly cipher: ISecretCipher,
    private readonly secretGenerator: ISecretGenerator,
    private readonly settings: Pick<WebhookSettings, "secretGraceHours">,
  ) {}

  async execute(
    input: RotateEndpointSecretInput,
  ): Promise<Result<RotateEndpointSecretOutput, RotateEndpointSecretError>> {
    const masterKey = this.masterKey();
    if (masterKey.isNone()) return Result.fail(MASTER_KEY_UNAVAILABLE);

    const found = await this.endpoints.findById(input.id, input.organizationId);
    if (found.isFailure) return Result.fail(found.getError());
    const current = found.getValue();
    if (current.isNone()) return Result.fail(ENDPOINT_NOT_FOUND);

    const plaintextSecret = this.secretGenerator.generate();
    const secretCipher = this.cipher.seal(
      plaintextSecret,
      masterKey.unwrap(),
      input.organizationId,
    );
    const previousSecretExpiresAt = new Date(
      Date.now() + this.settings.secretGraceHours * 3_600_000,
    );

    const rotated = await this.uow.run(
      async (): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> => {
        const result = await this.endpoints.applySecretRotation({
          id: input.id,
          organizationId: input.organizationId,
          secretCipher,
          previousSecretCipher: current.unwrap().secretCipher,
          previousSecretExpiresAt,
        });
        if (result.isFailure) return result;

        await emitBuiltEvent(
          this.outbox,
          webhookEndpointSecretRotatedEvent({ ...input, endpointId: input.id }),
          { organizationId: input.organizationId },
        );

        return result;
      },
    );
    if (rotated.isFailure) return Result.fail(rotated.getError());

    const endpoint = rotated.getValue();
    if (endpoint.isNone()) return Result.fail(ENDPOINT_NOT_FOUND);

    return Result.ok({ endpoint: endpoint.unwrap(), plaintextSecret });
  }
}
