import { db, eq, sql, webhooksSchema } from "@packages/drizzle";
import { decryptSecret, deriveOrgSubKey } from "../../../../shared/aead";
import { JITTER_BASE_MS, JITTER_MULTIPLIER, nextAttemptAt } from "../../../../shared/jitter";
import type { Logger } from "../../../../shared/logger";
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
};

export class WebhookDeliveryWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;

  constructor(private readonly deps: WebhookDeliveryWorkerDeps) {}

  async start(): Promise<void> {
    this.stopping = false;
    this.timer = setInterval(() => {
      this.drain().catch((err) => this.deps.logger.error({ err }, "webhook delivery drain failed"));
    }, POLL_INTERVAL_MS);
    this.deps.logger.info("webhook delivery worker started");
    void this.drain();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.draining) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.deps.logger.info("webhook delivery worker stopped");
  }

  private async drain(): Promise<void> {
    if (this.stopping || this.draining) return;
    this.draining = true;
    try {
      let drained: number;
      do {
        drained = await this.drainBatch();
      } while (drained === BATCH_SIZE && !this.stopping);
    } finally {
      this.draining = false;
    }
  }

  private async drainBatch(): Promise<number> {
    const claimed = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);
      const rows = await this.deps.deliveries.findPendingBatch(BATCH_SIZE, tx);
      if (rows.length === 0) return rows;
      const claimUntil = new Date(Date.now() + CLAIM_WINDOW_MS);
      for (const r of rows) {
        await this.deps.deliveries.updateStatus(
          r.id,
          {
            status: r.status,
            attempts: r.attempts,
            nextAttemptAt: claimUntil,
            lastError: r.lastError,
            lastResponseStatus: r.lastResponseStatus,
          },
          tx,
        );
      }
      return rows;
    });

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
          .transaction(async (tx) => this.markFailed(delivery, errMsg, null, tx))
          .catch((e) =>
            this.deps.logger.error({ err: e, deliveryId: delivery.id }, "markFailed failed"),
          );
      }
    }
    return claimed.length;
  }

  private async processDelivery(delivery: WebhookDeliveryRecord): Promise<void> {
    const endpointAndOrg = await this.findEndpointWithOrg(delivery.endpointId);
    if (!endpointAndOrg) {
      await db.transaction(async (tx) => {
        await this.deps.deliveries.updateStatus(
          delivery.id,
          {
            status: "dead_letter",
            attempts: delivery.attempts + 1,
            nextAttemptAt: null,
            lastError: "endpoint not found or disabled",
            lastResponseStatus: null,
          },
          tx,
        );
      });
      return;
    }

    const masterKeyOpt = this.deps.masterKey();
    if (masterKeyOpt.isNone()) {
      await db.transaction(async (tx) =>
        this.markFailed(delivery, "WEBHOOK_MASTER_KEY missing", null, tx),
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
      await db.transaction(async (tx) =>
        this.markFailed(delivery, "secret decryption failed", null, tx),
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

    let responseStatus: number | null = null;
    let errorMessage: string | null = null;
    const ctrl = new AbortController();
    const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(endpointAndOrg.url, {
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
      });
      responseStatus = res.status;
      if (!res.ok) errorMessage = `HTTP ${res.status}: ${res.statusText}`;
    } catch (err) {
      errorMessage = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    } finally {
      clearTimeout(timeoutHandle);
    }

    await db.transaction(async (tx) => {
      if (errorMessage) {
        await this.markFailed(delivery, errorMessage, responseStatus, tx);
      } else {
        await this.deps.deliveries.updateStatus(
          delivery.id,
          {
            status: "success",
            attempts: delivery.attempts + 1,
            nextAttemptAt: null,
            lastError: null,
            lastResponseStatus: responseStatus,
          },
          tx,
        );
      }
    });
  }

  private async markFailed(
    delivery: WebhookDeliveryRecord,
    error: string,
    responseStatus: number | null,
    tx: Parameters<IWebhookDeliveryRepository["updateStatus"]>[2],
  ): Promise<void> {
    const newAttempts = delivery.attempts + 1;
    const { date } = nextAttemptAt(newAttempts, expectedDelayFromAttempts(newAttempts));
    const status: "failed" | "dead_letter" = date === null ? "dead_letter" : "failed";
    await this.deps.deliveries.updateStatus(
      delivery.id,
      {
        status,
        attempts: newAttempts,
        nextAttemptAt: date,
        lastError: error,
        lastResponseStatus: responseStatus,
      },
      tx,
    );
  }

  private async findEndpointWithOrg(endpointId: string) {
    const we = webhooksSchema.webhookEndpoint;
    const [row] = await db
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
    if (!row?.enabled) return null;
    return row;
  }
}
