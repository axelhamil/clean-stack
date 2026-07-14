import { Option } from "@packages/ddd-kit";
import { db, eq, sql, webhooksSchema } from "@packages/drizzle";
import { decryptSecret, deriveOrgSubKey } from "../../../../shared/aead";
import { env } from "../../../../shared/env";
import { JITTER_BASE_MS, JITTER_MULTIPLIER, nextAttemptAt } from "../../../../shared/jitter";
import type { Logger } from "../../../../shared/logger";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import { assertPublicUrl } from "../../../../shared/ssrf-guard";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../application/ports/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "../../application/ports/webhook-endpoint.port";
import type { MasterKeyProvider } from "../../application/services/webhooks.service";
import { signWebhookPayload } from "./hmac-signer";

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 10;
const FETCH_TIMEOUT_MS = 30_000;
const CLAIM_WINDOW_MS = BATCH_SIZE * FETCH_TIMEOUT_MS + 30_000;

function expectedDelayFromAttempts(currentAttempts: number): number {
  return JITTER_BASE_MS * JITTER_MULTIPLIER ** Math.max(0, currentAttempts);
}

async function readCappedBody(res: Response, cap: number): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < cap) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = cap - offset;
    if (remaining <= 0) break;
    buf.set(chunk.subarray(0, Math.min(chunk.length, remaining)), offset);
    offset += Math.min(chunk.length, remaining);
  }
  return new TextDecoder().decode(buf);
}

export class WebhookDeliveryWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;

  constructor(
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly masterKey: MasterKeyProvider,
    private readonly outbox: IOutboxRepository,
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async start(): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > start", op: "function" },
      async () => {
        this.stopping = false;
        this.timer = setInterval(() => {
          this.drain().catch((err) => this.logger.error({ err }, "webhook delivery drain failed"));
        }, POLL_INTERVAL_MS);
        this.logger.info("webhook delivery worker started");
        void this.drain();
      },
    );
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
        this.logger.info("webhook delivery worker stopped");
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
        } while (drained === BATCH_SIZE && !this.stopping);
      } finally {
        this.draining = false;
      }
    });
  }

  private async drainBatch(): Promise<number> {
    const claimed = await this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > drainBatch" },
      () =>
        this.instrumentation.startSpan(
          {
            name: "db.transaction",
            op: "db.transaction",
            attributes: { "db.system.name": "postgresql" },
          },
          () =>
            db.transaction(async (tx) => {
              try {
                await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);
                const pending = await this.deliveries.findPendingBatch(BATCH_SIZE, tx);
                if (pending.isFailure) {
                  this.logger.error(
                    { err: pending.getError() },
                    "webhook delivery findPendingBatch failed",
                  );
                  return [];
                }
                const rows = pending.getValue();
                if (rows.length === 0) return rows;
                const claimUntil = new Date(Date.now() + CLAIM_WINDOW_MS);
                for (const r of rows) {
                  const upd = await this.deliveries.updateStatus(
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
                    this.logger.error(
                      { err: upd.getError(), deliveryId: r.id },
                      "webhook delivery claim updateStatus failed",
                    );
                  }
                }
                return rows;
              } catch (err) {
                this.instrumentation.capture(err);
                throw err;
              }
            }),
        ),
    );

    for (const delivery of claimed) {
      if (this.stopping) break;
      try {
        await this.processDelivery(delivery);
      } catch (err) {
        const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        this.logger.error(
          { err, deliveryId: delivery.id, eventType: delivery.eventType },
          "webhook delivery process threw",
        );
        await db
          .transaction(async (tx) => this.markFailed(delivery, errMsg, Option.none(), tx))
          .catch((e) =>
            this.logger.error({ err: e, deliveryId: delivery.id }, "markFailed failed"),
          );
      }
    }
    return claimed.length;
  }

  private async processDelivery(delivery: WebhookDeliveryRecord): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > processDelivery", op: "function" },
      async () => {
        const endpointResult = await this.findEndpointWithOrg(delivery.endpointId);
        if (!endpointResult.ok) {
          if (endpointResult.reason === "db_error") {
            await db
              .transaction(async (tx) =>
                this.markFailed(delivery, "endpoint lookup db error", Option.none(), tx),
              )
              .catch((e) =>
                this.logger.error(
                  { err: e, deliveryId: delivery.id },
                  "markFailed (db_error) failed",
                ),
              );
            return;
          }
          // not_found or disabled — permanent dead-letter
          await db.transaction(async (tx) => {
            const upd = await this.deliveries.updateStatus(
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
              this.logger.error(
                { err: upd.getError(), deliveryId: delivery.id },
                "webhook delivery dead-letter updateStatus failed",
              );
            }
          });
          return;
        }
        const endpointAndOrg = endpointResult.row;

        const guard = await assertPublicUrl(endpointAndOrg.url);
        if (guard.isFailure) {
          await db.transaction(async (tx) => {
            const upd = await this.deliveries.updateStatus(
              delivery.id,
              {
                status: "dead_letter",
                attempts: delivery.attempts + 1,
                nextAttemptAt: Option.none(),
                lastError: Option.some("destination not publicly routable"),
                lastResponseStatus: Option.none(),
              },
              tx,
            );
            if (upd.isFailure) {
              this.logger.error(
                { err: upd.getError(), deliveryId: delivery.id },
                "webhook delivery ssrf dead-letter updateStatus failed",
              );
            }
            const attemptRes = await this.deliveries.createAttempt(
              {
                deliveryId: delivery.id,
                attemptNumber: delivery.attempts + 1,
                requestHeaders: null,
                requestBody: null,
                responseStatus: null,
                responseHeaders: null,
                responseBody: null,
                durationMs: 0,
                error: "destination not publicly routable",
              },
              tx,
            );
            if (attemptRes.isFailure) {
              this.logger.error(
                { err: attemptRes.getError(), deliveryId: delivery.id },
                "webhook delivery ssrf createAttempt failed",
              );
            }
          });
          return;
        }

        const masterKeyOpt = this.masterKey();
        if (masterKeyOpt.isNone()) {
          await db.transaction(async (tx) =>
            this.markFailed(delivery, "WEBHOOK_MASTER_KEY missing", Option.none(), tx),
          );
          return;
        }

        let secrets: string[];
        try {
          const subKey = deriveOrgSubKey(masterKeyOpt.unwrap(), endpointAndOrg.organizationId);
          const current = decryptSecret(endpointAndOrg.secretCipher, subKey);
          secrets = [current];
          if (
            endpointAndOrg.previousSecretCipher != null &&
            endpointAndOrg.previousSecretExpiresAt &&
            endpointAndOrg.previousSecretExpiresAt > new Date()
          ) {
            const previous = decryptSecret(endpointAndOrg.previousSecretCipher, subKey);
            secrets.push(previous);
          }
        } catch (err) {
          this.logger.error(
            { err, deliveryId: delivery.id, endpointId: endpointAndOrg.id },
            "webhook secret decryption failed",
          );
          this.instrumentation.capture(err);
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
        const signature = await signWebhookPayload(rawBody, secrets, ts);

        const requestHeaders: Record<string, string> = {
          "content-type": "application/json",
          "x-webhook-signature": signature,
          "x-webhook-event-id": delivery.outboxEventId,
          "x-webhook-event-type": delivery.eventType,
          "x-webhook-idempotency": delivery.idempotencyKey,
        };

        let responseStatus: Option<number> = Option.none();
        let errorMessage: Option<string> = Option.none();
        const responseHeaders: Record<string, string> = {};
        let responseBody: string | null = null;
        const startedAt = Date.now();
        const ctrl = new AbortController();
        const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await this.instrumentation.startSpan(
            {
              name: `POST ${endpointAndOrg.url}`,
              op: "http.client",
              attributes: { "http.method": "POST" },
            },
            () =>
              fetch(endpointAndOrg.url, {
                method: "POST",
                headers: requestHeaders,
                body: rawBody,
                signal: ctrl.signal,
              }),
          );
          responseStatus = Option.some(res.status);
          res.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          responseBody = await readCappedBody(res, env.WEBHOOK_RESPONSE_CAPTURE_BYTES);
          if (!res.ok) errorMessage = Option.some(`HTTP ${res.status}: ${res.statusText}`);
        } catch (err) {
          this.instrumentation.capture(err);
          errorMessage = Option.some(
            err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          );
        } finally {
          clearTimeout(timeoutHandle);
        }
        const durationMs = Date.now() - startedAt;

        await db.transaction(async (tx) => {
          if (errorMessage.isSome()) {
            await this.markFailed(delivery, errorMessage.unwrap(), responseStatus, tx);
          } else {
            const upd = await this.deliveries.updateStatus(
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
              this.logger.error(
                { err: upd.getError(), deliveryId: delivery.id },
                "webhook delivery success updateStatus failed",
              );
            }
          }
          const attemptRes = await this.deliveries.createAttempt(
            {
              deliveryId: delivery.id,
              attemptNumber: delivery.attempts + 1,
              requestHeaders,
              requestBody: rawBody,
              responseStatus: responseStatus.isSome() ? responseStatus.unwrap() : null,
              responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : null,
              responseBody,
              durationMs,
              error: errorMessage.isSome() ? errorMessage.unwrap() : null,
            },
            tx,
          );
          if (attemptRes.isFailure) {
            this.logger.error(
              { err: attemptRes.getError(), deliveryId: delivery.id },
              "webhook delivery createAttempt failed",
            );
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
    const upd = await this.deliveries.updateStatus(
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
      this.logger.error(
        { err: upd.getError(), deliveryId: delivery.id },
        "webhook delivery markFailed updateStatus failed",
      );
    }
  }

  private async findEndpointWithOrg(endpointId: string): Promise<
    | {
        ok: true;
        row: {
          id: string;
          url: string;
          organizationId: string;
          secretCipher: string;
          previousSecretCipher: string | null;
          previousSecretExpiresAt: Date | null;
          enabled: boolean;
        };
      }
    | { ok: false; reason: "not_found" | "db_error" }
  > {
    return this.instrumentation.startSpan(
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
              previousSecretCipher: we.previousSecretCipher,
              previousSecretExpiresAt: we.previousSecretExpiresAt,
              enabled: we.enabled,
            })
            .from(we)
            .where(eq(we.id, endpointId))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
          if (!row?.enabled) return { ok: false, reason: "not_found" } as const;
          return { ok: true, row } as const;
        } catch (err) {
          this.instrumentation.capture(err);
          return { ok: false, reason: "db_error" } as const;
        }
      },
    );
  }
}
