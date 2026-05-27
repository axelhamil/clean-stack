import { Option } from "@packages/ddd-kit";
import { db, eq, sql, webhooksSchema } from "@packages/drizzle";
import { decryptSecret, deriveOrgSubKey } from "../../../../shared/aead";
import { JITTER_BASE_MS, JITTER_MULTIPLIER, nextAttemptAt } from "../../../../shared/jitter";
import type { Logger } from "../../../../shared/logger";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../application/ports/webhook-delivery.port";
import type { MasterKeyProvider } from "../../application/services/webhooks.service";
import { signWebhookPayload } from "./hmac-signer";

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 10;
const FETCH_TIMEOUT_MS = 30_000;
const CLAIM_WINDOW_MS = BATCH_SIZE * FETCH_TIMEOUT_MS + 30_000;

function expectedDelayFromAttempts(currentAttempts: number): number {
  return JITTER_BASE_MS * JITTER_MULTIPLIER ** Math.max(0, currentAttempts);
}

export type WebhookDeliveryWorkerDeps = {
  deliveries: IWebhookDeliveryRepository;
  masterKey: MasterKeyProvider;
  logger: Logger;
  instrumentation: IInstrumentation;
};

export class WebhookDeliveryWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;

  constructor(private readonly deps: WebhookDeliveryWorkerDeps) {}

  async start(): Promise<void> {
    return this.deps.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > start", op: "function" },
      async () => {
        this.stopping = false;
        this.timer = setInterval(() => {
          this.drain().catch((err) =>
            this.deps.logger.error({ err }, "webhook delivery drain failed"),
          );
        }, POLL_INTERVAL_MS);
        this.deps.logger.info("webhook delivery worker started");
        void this.drain();
      },
    );
  }

  async stop(): Promise<void> {
    return this.deps.instrumentation.startSpan(
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
        this.deps.logger.info("webhook delivery worker stopped");
      },
    );
  }

  private async drain(): Promise<void> {
    if (this.stopping || this.draining) return;
    this.draining = true;
    return this.deps.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > drain" },
      async () => {
        try {
          let drained: number;
          do {
            drained = await this.drainBatch();
          } while (drained === BATCH_SIZE && !this.stopping);
        } finally {
          this.draining = false;
        }
      },
    );
  }

  private async drainBatch(): Promise<number> {
    const claimed = await this.deps.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > drainBatch" },
      () =>
        this.deps.instrumentation.startSpan(
          {
            name: "db.transaction",
            op: "db.transaction",
            attributes: { "db.system.name": "postgresql" },
          },
          () =>
            db.transaction(async (tx) => {
              await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);
              const pending = await this.deps.deliveries.findPendingBatch(BATCH_SIZE, tx);
              if (pending.isFailure) {
                this.deps.logger.error(
                  { err: pending.getError() },
                  "webhook delivery findPendingBatch failed",
                );
                return [];
              }
              const rows = pending.getValue();
              if (rows.length === 0) return rows;
              const claimUntil = new Date(Date.now() + CLAIM_WINDOW_MS);
              for (const r of rows) {
                const upd = await this.deps.deliveries.updateStatus(
                  r.id,
                  {
                    status: r.status,
                    attempts: r.attempts,
                    nextAttemptAt: Option.some(claimUntil),
                    lastError: r.lastError,
                    lastResponseStatus: r.lastResponseStatus,
                  },
                  tx,
                );
                if (upd.isFailure) {
                  this.deps.logger.error(
                    { err: upd.getError(), deliveryId: r.id },
                    "webhook delivery claim updateStatus failed",
                  );
                }
              }
              return rows;
            }),
        ),
    );

    for (const delivery of claimed) {
      if (this.stopping) break;
      try {
        await this.processDelivery(delivery);
      } catch (err) {
        const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        this.deps.logger.error(
          { err, deliveryId: delivery.id, eventType: delivery.eventType },
          "webhook delivery process threw",
        );
        await db
          .transaction(async (tx) => this.markFailed(delivery, errMsg, Option.none(), tx))
          .catch((e) =>
            this.deps.logger.error({ err: e, deliveryId: delivery.id }, "markFailed failed"),
          );
      }
    }
    return claimed.length;
  }

  private async processDelivery(delivery: WebhookDeliveryRecord): Promise<void> {
    return this.deps.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > processDelivery", op: "function" },
      async () => {
        const endpointAndOrg = await this.findEndpointWithOrg(delivery.endpointId);
        if (!endpointAndOrg) {
          await db.transaction(async (tx) => {
            const upd = await this.deps.deliveries.updateStatus(
              delivery.id,
              {
                status: "dead_letter",
                attempts: delivery.attempts + 1,
                nextAttemptAt: Option.none(),
                lastError: Option.some("endpoint not found or disabled"),
                lastResponseStatus: Option.none(),
              },
              tx,
            );
            if (upd.isFailure) {
              this.deps.logger.error(
                { err: upd.getError(), deliveryId: delivery.id },
                "webhook delivery dead-letter updateStatus failed",
              );
            }
          });
          return;
        }

        const masterKeyOpt = this.deps.masterKey();
        if (masterKeyOpt.isNone()) {
          await db.transaction(async (tx) =>
            this.markFailed(delivery, "WEBHOOK_MASTER_KEY missing", Option.none(), tx),
          );
          return;
        }

        let secret: string;
        try {
          const subKey = deriveOrgSubKey(masterKeyOpt.unwrap(), endpointAndOrg.organizationId);
          secret = decryptSecret(endpointAndOrg.secretCipher, subKey);
        } catch (err) {
          this.deps.logger.error(
            { err, deliveryId: delivery.id, endpointId: endpointAndOrg.id },
            "webhook secret decryption failed",
          );
          this.deps.instrumentation.capture(err);
          await db.transaction(async (tx) =>
            this.markFailed(delivery, "secret decryption failed", Option.none(), tx),
          );
          return;
        }

        const rawBody = JSON.stringify({
          id: delivery.outboxEventId,
          type: delivery.eventType,
          data: delivery.payload,
          time: delivery.createdAt.toISOString(),
        });
        const ts = Math.floor(Date.now() / 1000);
        const signature = await signWebhookPayload(rawBody, secret, ts);

        let responseStatus: Option<number> = Option.none();
        let errorMessage: Option<string> = Option.none();
        const ctrl = new AbortController();
        const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await this.deps.instrumentation.startSpan(
            {
              name: `POST ${endpointAndOrg.url}`,
              op: "http.client",
              attributes: { "http.method": "POST" },
            },
            () =>
              fetch(endpointAndOrg.url, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-webhook-signature": signature,
                  "x-webhook-event-id": delivery.outboxEventId,
                  "x-webhook-event-type": delivery.eventType,
                  "x-webhook-idempotency": delivery.idempotencyKey,
                },
                body: rawBody,
                signal: ctrl.signal,
              }),
          );
          responseStatus = Option.some(res.status);
          if (!res.ok) errorMessage = Option.some(`HTTP ${res.status}: ${res.statusText}`);
        } catch (err) {
          this.deps.instrumentation.capture(err);
          errorMessage = Option.some(
            err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          );
        } finally {
          clearTimeout(timeoutHandle);
        }

        await db.transaction(async (tx) => {
          if (errorMessage.isSome()) {
            await this.markFailed(delivery, errorMessage.unwrap(), responseStatus, tx);
          } else {
            const upd = await this.deps.deliveries.updateStatus(
              delivery.id,
              {
                status: "success",
                attempts: delivery.attempts + 1,
                nextAttemptAt: Option.none(),
                lastError: Option.none(),
                lastResponseStatus: responseStatus,
              },
              tx,
            );
            if (upd.isFailure) {
              this.deps.logger.error(
                { err: upd.getError(), deliveryId: delivery.id },
                "webhook delivery success updateStatus failed",
              );
            }
          }
        });
      },
    );
  }

  private async markFailed(
    delivery: WebhookDeliveryRecord,
    error: string,
    responseStatus: Option<number>,
    tx: Parameters<IWebhookDeliveryRepository["updateStatus"]>[2],
  ): Promise<void> {
    const newAttempts = delivery.attempts + 1;
    const { date } = nextAttemptAt(newAttempts, expectedDelayFromAttempts(newAttempts));
    const status: "failed" | "dead_letter" = date === null ? "dead_letter" : "failed";
    const upd = await this.deps.deliveries.updateStatus(
      delivery.id,
      {
        status,
        attempts: newAttempts,
        nextAttemptAt: Option.fromNullable(date),
        lastError: Option.some(error),
        lastResponseStatus: responseStatus,
      },
      tx,
    );
    if (upd.isFailure) {
      this.deps.logger.error(
        { err: upd.getError(), deliveryId: delivery.id },
        "webhook delivery markFailed updateStatus failed",
      );
    }
  }

  private async findEndpointWithOrg(endpointId: string) {
    return this.deps.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > findEndpointWithOrg" },
      async () => {
        try {
          const we = webhooksSchema.webhookEndpoint;
          const query = db
            .select({
              id: we.id,
              url: we.url,
              organizationId: we.organizationId,
              secretCipher: we.secretCipher,
              enabled: we.enabled,
            })
            .from(we)
            .where(eq(we.id, endpointId))
            .limit(1);
          const [row] = await this.deps.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
          if (!row?.enabled) return null;
          return row;
        } catch (err) {
          this.deps.instrumentation.capture(err);
          return null;
        }
      },
    );
  }
}
