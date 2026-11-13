import type { IInstrumentation, ILogger, IUseCase } from "@packages/ddd-kit";
import {
  type Clock,
  leaseCountdown,
  monotonicClock,
  unitsWithinLease,
} from "@packages/outbox/lease-budget";
import {
  WEBHOOK_DNS_TIMEOUT_SECONDS,
  WEBHOOK_FETCH_TIMEOUT_SECONDS,
  WEBHOOK_SETTLE_MARGIN_SECONDS,
  type WebhookDeliverySettings,
} from "../../application/config/webhook-settings";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../application/ports/repositories/webhook-delivery.port";
import type { WebhookRepoError } from "../../application/ports/repositories/webhook-endpoint.port";
import {
  type DeliveryOutcome,
  errorText,
  failedOutcome,
} from "../../application/services/delivery-policy.service";
import type { DeliverWebhookInput } from "../../application/usecases/deliver-webhook/deliver-webhook.dto";
import type {
  SettleDeliveryInput,
  SettleDeliveryOutput,
} from "../../application/usecases/settle-delivery/settle-delivery.dto";

const POLL_INTERVAL_MS = 5_000;
const MAX_CLAIM = 10;
const DELIVERY_BUDGET = {
  unitSeconds: WEBHOOK_DNS_TIMEOUT_SECONDS + WEBHOOK_FETCH_TIMEOUT_SECONDS,
  marginSeconds: WEBHOOK_SETTLE_MARGIN_SECONDS,
};

export class WebhookDeliveryWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;
  private readonly claimLimit: number;

  constructor(
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly deliver: IUseCase<DeliverWebhookInput, DeliveryOutcome, never>,
    private readonly settle: IUseCase<SettleDeliveryInput, SettleDeliveryOutput, WebhookRepoError>,
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: Pick<WebhookDeliverySettings, "leaseSeconds">,
    private readonly clock: Clock = monotonicClock,
  ) {
    this.claimLimit = Math.min(MAX_CLAIM, unitsWithinLease(settings.leaseSeconds, DELIVERY_BUDGET));
  }

  async start(): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > start", op: "function" },
      async () => {
        this.stopping = false;
        this.timer = setInterval(() => this.drainSafely(), POLL_INTERVAL_MS);
        this.logger.info({}, "webhook delivery worker started");
        this.drainSafely();
      },
    );
  }

  private drainSafely(): void {
    this.drain().catch((err) => {
      this.instrumentation.capture(err);
      this.logger.error({ err }, "webhook delivery drain failed");
    });
  }

  async stop(): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > stop", op: "function" },
      async () => {
        this.stopping = true;
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        while (this.draining) {
          await new Promise((r) => setTimeout(r, 50));
        }
        this.logger.info({}, "webhook delivery worker stopped");
      },
    );
  }

  private async drain(): Promise<void> {
    if (this.stopping || this.draining) return;
    this.draining = true;
    return this.instrumentation.startSpan({ name: "WebhookDeliveryWorker > drain" }, async () => {
      try {
        let drained: number;
        do {
          drained = await this.drainBatch();
        } while (drained === this.claimLimit && !this.stopping);
      } finally {
        this.draining = false;
      }
    });
  }

  private async drainBatch(): Promise<number> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > drainBatch" },
      async () => {
        const lease = leaseCountdown(this.settings.leaseSeconds, DELIVERY_BUDGET, this.clock);
        const claimed = await this.deliveries.claim({
          limit: this.claimLimit,
          leaseSeconds: this.settings.leaseSeconds,
        });
        if (claimed.isFailure) {
          this.logger.error({ err: claimed.getError() }, "webhook delivery claim failed");
          return 0;
        }

        const batch = claimed.getValue();
        for (const [index, delivery] of batch.entries()) {
          if (this.stopping || (index > 0 && !lease.coversNextUnit())) {
            await this.release(batch.slice(index));
            break;
          }

          const outcome = await this.processDelivery(delivery).catch((err) =>
            this.thrownOutcome(delivery, err),
          );
          await this.settleDelivery(delivery, outcome).catch((err) => {
            this.instrumentation.capture(err);
            this.logger.error({ err, deliveryId: delivery.id }, "webhook delivery settle failed");
          });
        }
        return batch.length;
      },
    );
  }

  private async processDelivery(delivery: WebhookDeliveryRecord): Promise<DeliveryOutcome> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > processDelivery", op: "function" },
      async () => {
        const delivered = await this.deliver.execute({ delivery });
        return delivered.getValue();
      },
    );
  }

  private thrownOutcome(delivery: WebhookDeliveryRecord, err: unknown): DeliveryOutcome {
    this.instrumentation.capture(err);
    this.logger.error(
      { err, deliveryId: delivery.id, eventType: delivery.eventType },
      "webhook delivery process threw",
    );

    return failedOutcome(errorText(err));
  }

  private async settleDelivery(
    delivery: WebhookDeliveryRecord,
    outcome: DeliveryOutcome,
  ): Promise<void> {
    const settled = await this.settle.execute({ delivery, outcome });
    if (settled.isFailure) {
      this.logger.error(
        { err: settled.getError(), deliveryId: delivery.id },
        "webhook delivery settle failed",
      );
      return;
    }
    if (!settled.getValue().written) {
      this.logger.warn(
        { deliveryId: delivery.id, attempts: delivery.attempts },
        "webhook delivery settle skipped a delivery whose lease was lost",
      );
    }
  }

  private async release(unstarted: WebhookDeliveryRecord[]): Promise<void> {
    let released = 0;
    for (const delivery of unstarted) {
      const result = await this.deliveries.release(delivery);
      if (result.isFailure) {
        this.logger.error(
          { err: result.getError(), deliveryId: delivery.id },
          "webhook delivery release failed",
        );
        continue;
      }
      if (result.getValue()) released++;
    }

    this.logger.info({ released }, "webhook delivery worker released unstarted deliveries");
  }
}
