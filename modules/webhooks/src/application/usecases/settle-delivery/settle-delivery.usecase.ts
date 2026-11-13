import { type ILogger, type IUnitOfWork, type IUseCase, Option, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { WebhookDeliverySettings } from "../../config/webhook-settings";
import { webhookDeliveryExhaustedEvent } from "../../events/webhook-delivery-exhausted.event";
import { webhookEndpointDisabledEvent } from "../../events/webhook-endpoint-disabled.event";
import type {
  DeliveryFailure,
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../ports/repositories/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookRepoError,
} from "../../ports/repositories/webhook-endpoint.port";
import {
  type AttemptLog,
  deliveryFailure,
  shouldAutoDisable,
} from "../../services/delivery-policy.service";
import type { SettleDeliveryInput, SettleDeliveryOutput } from "./settle-delivery.dto";

export class SettleDeliveryUseCase
  implements IUseCase<SettleDeliveryInput, SettleDeliveryOutput, WebhookRepoError>
{
  constructor(
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly logger: ILogger,
    private readonly settings: WebhookDeliverySettings,
  ) {}

  async execute({
    delivery,
    outcome,
  }: SettleDeliveryInput): Promise<Result<SettleDeliveryOutput, WebhookRepoError>> {
    const { verdict } = outcome;
    const failure =
      verdict.kind === "failure"
        ? Option.some(
            deliveryFailure(
              delivery,
              verdict.error,
              outcome.responseStatus,
              verdict.terminal,
              this.settings.deadRetrySeconds,
            ),
          )
        : Option.none<DeliveryFailure>();

    const settled = await this.uow.run(async (): Promise<Result<boolean, WebhookRepoError>> => {
      const written = failure.isSome()
        ? await this.deliveries.markFailed(delivery, failure.unwrap())
        : await this.deliveries.markSuccess(delivery, outcome.responseStatus);
      if (written.isFailure) return written;

      const wrote = written.getValue();
      const attempt = outcome.attempt.toUndefined();
      if (attempt && (wrote || attempt.requestSent))
        await this.recordAttempt(delivery, attempt.log);
      if (!wrote || outcome.organizationId.isNone()) return written;

      const organizationId = outcome.organizationId.unwrap();
      if (failure.isNone()) {
        await this.resetEndpointFailures(delivery, organizationId);
        return written;
      }

      const firstDeath =
        failure.unwrap().status === "dead_letter" && delivery.status !== "dead_letter";
      if (firstDeath) await this.announceFirstDeath(delivery, organizationId);

      return written;
    });
    if (settled.isFailure) return Result.fail(settled.getError());

    return Result.ok({ written: settled.getValue() });
  }

  private async recordAttempt(delivery: WebhookDeliveryRecord, log: AttemptLog): Promise<void> {
    const recorded = await this.deliveries.createAttempt({
      ...log,
      deliveryId: delivery.id,
      attemptNumber: delivery.attempts,
    });
    if (recorded.isFailure) {
      this.logger.error(
        { err: recorded.getError(), deliveryId: delivery.id },
        "webhook delivery createAttempt failed",
      );
    }
  }

  private async resetEndpointFailures(
    delivery: WebhookDeliveryRecord,
    organizationId: string,
  ): Promise<void> {
    const reset = await this.endpoints.resetFailure(delivery.endpointId, organizationId);
    if (reset.isFailure) {
      this.logger.error(
        { err: reset.getError(), endpointId: delivery.endpointId },
        "webhook endpoint resetFailure failed",
      );
    }
  }

  private async announceFirstDeath(
    delivery: WebhookDeliveryRecord,
    organizationId: string,
  ): Promise<void> {
    await emitBuiltEvent(this.outbox, webhookDeliveryExhaustedEvent(delivery, organizationId), {
      organizationId,
    });

    const bumped = await this.endpoints.bumpFailure(delivery.endpointId, organizationId);
    if (bumped.isFailure) {
      this.logger.error(
        { err: bumped.getError(), endpointId: delivery.endpointId },
        "webhook endpoint bumpFailure failed",
      );
      return;
    }
    const streak = bumped.getValue();
    if (streak.isNone()) return;

    const now = new Date();
    if (!shouldAutoDisable(streak.unwrap(), now, this.settings)) return;

    const disabled = await this.endpoints.markDisabled(delivery.endpointId, organizationId, now);
    if (disabled.isFailure) {
      this.logger.error(
        { err: disabled.getError(), endpointId: delivery.endpointId },
        "webhook endpoint markDisabled failed",
      );
      return;
    }

    await emitBuiltEvent(
      this.outbox,
      webhookEndpointDisabledEvent({
        organizationId,
        endpointId: delivery.endpointId,
        consecutiveFailures: streak.unwrap().consecutiveFailures,
      }),
      { organizationId },
    );
  }
}
