import { type IUnitOfWork, Option, type Result } from "@packages/ddd-kit";
import { db, eq, webhooksSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { decryptSecret, deriveOrgSubKey } from "../../../../shared/aead";
import { env } from "../../../../shared/env";
import {
  WEBHOOK_DNS_TIMEOUT_SECONDS,
  WEBHOOK_FETCH_TIMEOUT_SECONDS,
  WEBHOOK_SETTLE_MARGIN_SECONDS,
} from "../../../../shared/env-bounds";
import { emitEvent } from "../../../../shared/event-emitter";
import { failureSchedule } from "../../../../shared/jitter";
import {
  type Clock,
  leaseCountdown,
  monotonicClock,
  unitsWithinLease,
} from "../../../../shared/lease-budget";
import type { Logger } from "../../../../shared/logger";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import { assertPublicUrl } from "../../../../shared/ssrf-guard";
import type {
  DeliveryFailure,
  IWebhookDeliveryRepository,
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../../application/ports/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookRepoError,
} from "../../application/ports/webhook-endpoint.port";
import type { MasterKeyProvider } from "../../application/services/webhooks.service";
import { signWebhookPayload } from "./hmac-signer";

const POLL_INTERVAL_MS = 5_000;
const MAX_CLAIM = 10;
const WEBHOOK_MAX_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = WEBHOOK_FETCH_TIMEOUT_SECONDS * 1000;
const DELIVERY_BUDGET = {
  unitSeconds: WEBHOOK_DNS_TIMEOUT_SECONDS + WEBHOOK_FETCH_TIMEOUT_SECONDS,
  marginSeconds: WEBHOOK_SETTLE_MARGIN_SECONDS,
};

export interface WebhookDeliveryOptions {
  leaseSeconds: number;
  deadRetrySeconds: number;
}

type AttemptLog = Omit<
  WebhookDeliveryAttemptRecord,
  "id" | "createdAt" | "deliveryId" | "attemptNumber"
>;

type Outcome = {
  verdict: { kind: "success" } | { kind: "failure"; error: string; terminal: boolean };
  responseStatus: Option<number>;
  organizationId: Option<string>;
  attempt: Option<{ log: AttemptLog; requestSent: boolean }>;
};

function failed(
  error: string,
  overrides: Partial<Omit<Outcome, "verdict">> & { terminal?: boolean } = {},
): Outcome {
  return {
    verdict: { kind: "failure", error, terminal: overrides.terminal ?? false },
    responseStatus: overrides.responseStatus ?? Option.none(),
    organizationId: overrides.organizationId ?? Option.none(),
    attempt: overrides.attempt ?? Option.none(),
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function shouldAutoDisable(
  { consecutiveFailures, firstFailedAt }: { consecutiveFailures: number; firstFailedAt: Date },
  now: Date,
): boolean {
  return (
    consecutiveFailures >= env.WEBHOOK_AUTO_DISABLE_MIN_FAILURES &&
    now.getTime() - firstFailedAt.getTime() > env.WEBHOOK_AUTO_DISABLE_AFTER_DAYS * 86_400_000
  );
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
  private readonly claimLimit: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly deliveries: IWebhookDeliveryRepository,
    private readonly endpoints: IWebhookEndpointRepository,
    private readonly masterKey: MasterKeyProvider,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
    private readonly options: WebhookDeliveryOptions,
    fetchImpl: typeof fetch = fetch,
    private readonly clock: Clock = monotonicClock,
  ) {
    this.claimLimit = Math.min(MAX_CLAIM, unitsWithinLease(options.leaseSeconds, DELIVERY_BUDGET));
    this.fetchImpl = fetchImpl;
  }

  async start(): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > start", op: "function" },
      async () => {
        this.stopping = false;
        this.timer = setInterval(() => this.drainSafely(), POLL_INTERVAL_MS);
        this.logger.info("webhook delivery worker started");
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
        const lease = leaseCountdown(this.options.leaseSeconds, DELIVERY_BUDGET, this.clock);
        const claimed = await this.deliveries.claim({
          limit: this.claimLimit,
          leaseSeconds: this.options.leaseSeconds,
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
          await this.settle(delivery, outcome).catch((err) => {
            this.instrumentation.capture(err);
            this.logger.error({ err, deliveryId: delivery.id }, "webhook delivery settle failed");
          });
        }
        return batch.length;
      },
    );
  }

  private thrownOutcome(delivery: WebhookDeliveryRecord, err: unknown): Outcome {
    this.instrumentation.capture(err);
    this.logger.error(
      { err, deliveryId: delivery.id, eventType: delivery.eventType },
      "webhook delivery process threw",
    );

    return failed(errorText(err));
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

  private async processDelivery(delivery: WebhookDeliveryRecord): Promise<Outcome> {
    return this.instrumentation.startSpan(
      { name: "WebhookDeliveryWorker > processDelivery", op: "function" },
      async () => {
        const endpointResult = await this.findEndpointWithOrg(delivery.endpointId);
        if (!endpointResult.ok) {
          if (endpointResult.reason === "db_error") return failed("endpoint lookup db error");

          return failed("endpoint not found or disabled", { terminal: true });
        }
        const endpointAndOrg = endpointResult.row;
        const organizationId = Option.some(endpointAndOrg.organizationId);

        const guard = await assertPublicUrl(endpointAndOrg.url);
        if (guard.isFailure && guard.getError().code === "WEBHOOK_HOST_LOOKUP_TIMEOUT") {
          return failed(guard.getError().message, { organizationId });
        }
        if (guard.isFailure) {
          return failed("destination not publicly routable", {
            terminal: true,
            organizationId,
            attempt: Option.some({
              requestSent: false,
              log: {
                requestHeaders: Option.none(),
                requestBody: Option.none(),
                responseStatus: Option.none(),
                responseHeaders: Option.none(),
                responseBody: Option.none(),
                durationMs: Option.some(0),
                error: Option.some("destination not publicly routable"),
              },
            }),
          });
        }

        const masterKeyOpt = this.masterKey();
        if (masterKeyOpt.isNone()) return failed("WEBHOOK_MASTER_KEY missing", { organizationId });

        let secrets: string[];
        try {
          const subKey = deriveOrgSubKey(masterKeyOpt.unwrap(), endpointAndOrg.organizationId);
          const current = decryptSecret(endpointAndOrg.secretCipher, subKey);
          secrets = [current];
          if (
            endpointAndOrg.previousSecretCipher.isSome() &&
            endpointAndOrg.previousSecretExpiresAt.isSome() &&
            endpointAndOrg.previousSecretExpiresAt.unwrap() > new Date()
          ) {
            const previous = decryptSecret(endpointAndOrg.previousSecretCipher.unwrap(), subKey);
            secrets.push(previous);
          }
        } catch (err) {
          this.logger.error(
            { err, deliveryId: delivery.id, endpointId: endpointAndOrg.id },
            "webhook secret decryption failed",
          );
          this.instrumentation.capture(err);
          return failed("secret decryption failed", { organizationId });
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
              this.fetchImpl(endpointAndOrg.url, {
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
          errorMessage = Option.some(errorText(err));
        } finally {
          clearTimeout(timeoutHandle);
        }

        const attempt = Option.some({
          requestSent: true,
          log: {
            requestHeaders: Option.some(requestHeaders),
            requestBody: Option.some(rawBody),
            responseStatus,
            responseHeaders:
              Object.keys(responseHeaders).length > 0
                ? Option.some(responseHeaders)
                : Option.none<Record<string, string>>(),
            responseBody: Option.fromNullable(responseBody),
            durationMs: Option.some(Date.now() - startedAt),
            error: errorMessage,
          },
        });
        if (errorMessage.isSome()) {
          return failed(errorMessage.unwrap(), { responseStatus, organizationId, attempt });
        }

        return { verdict: { kind: "success" }, responseStatus, organizationId, attempt };
      },
    );
  }

  private failureOf(
    delivery: WebhookDeliveryRecord,
    error: string,
    outcome: Outcome,
    terminal: boolean,
  ): DeliveryFailure {
    const base = { lastError: error, lastResponseStatus: outcome.responseStatus };
    if (terminal) return { ...base, status: "dead_letter", retryAfterSeconds: Option.none() };

    const { dead, retryAfterSeconds } = failureSchedule(delivery.attempts, {
      wasDead: delivery.status === "dead_letter",
      maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      deadRetrySeconds: this.options.deadRetrySeconds,
    });

    return {
      ...base,
      status: dead ? "dead_letter" : "failed",
      retryAfterSeconds: Option.some(retryAfterSeconds),
    };
  }

  private async settle(delivery: WebhookDeliveryRecord, outcome: Outcome): Promise<void> {
    const { verdict } = outcome;
    const failure =
      verdict.kind === "failure"
        ? Option.some(this.failureOf(delivery, verdict.error, outcome, verdict.terminal))
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
      if (firstDeath)
        await this.runTerminalFailureBlock(delivery, organizationId, delivery.attempts);
      return written;
    });

    if (settled.isFailure) {
      this.logger.error(
        { err: settled.getError(), deliveryId: delivery.id },
        "webhook delivery settle failed",
      );
      return;
    }
    if (!settled.getValue()) {
      this.logger.warn(
        { deliveryId: delivery.id, attempts: delivery.attempts },
        "webhook delivery settle skipped a delivery whose lease was lost",
      );
    }
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

  private async runTerminalFailureBlock(
    delivery: WebhookDeliveryRecord,
    organizationId: string,
    attempts: number,
  ): Promise<void> {
    await emitEvent(
      this.outbox,
      EventTypes.WEBHOOK_DELIVERY_EXHAUSTED,
      "webhook_delivery",
      delivery.id,
      {
        organizationId,
        endpointId: delivery.endpointId,
        deliveryId: delivery.id,
        eventType: delivery.eventType,
        attempts,
        actorUserId: null,
      },
      { organizationId },
    );

    const bumpedResult = await this.endpoints.bumpFailure(delivery.endpointId, organizationId);
    if (bumpedResult.isFailure) {
      this.logger.error(
        { err: bumpedResult.getError(), endpointId: delivery.endpointId },
        "webhook endpoint bumpFailure failed",
      );
      return;
    }
    const bumpedOpt = bumpedResult.getValue();
    if (bumpedOpt.isNone()) return;

    const bumped = bumpedOpt.unwrap();
    const now = new Date();
    if (!shouldAutoDisable(bumped, now)) return;

    const disableRes = await this.endpoints.markDisabled(delivery.endpointId, organizationId, now);
    if (disableRes.isFailure) {
      this.logger.error(
        { err: disableRes.getError(), endpointId: delivery.endpointId },
        "webhook endpoint markDisabled failed",
      );
      return;
    }
    await emitEvent(
      this.outbox,
      EventTypes.WEBHOOK_ENDPOINT_DISABLED,
      "webhook_endpoint",
      delivery.endpointId,
      {
        organizationId,
        endpointId: delivery.endpointId,
        actorUserId: null,
        reason: "delivery_failures",
        consecutiveFailures: bumped.consecutiveFailures,
      },
      { organizationId },
    );
  }

  private async findEndpointWithOrg(endpointId: string): Promise<
    | {
        ok: true;
        row: {
          id: string;
          url: string;
          organizationId: string;
          secretCipher: string;
          previousSecretCipher: Option<string>;
          previousSecretExpiresAt: Option<Date>;
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
          return {
            ok: true,
            row: {
              id: row.id,
              url: row.url,
              organizationId: row.organizationId,
              secretCipher: row.secretCipher,
              previousSecretCipher: Option.fromNullable(row.previousSecretCipher),
              previousSecretExpiresAt: Option.fromNullable(row.previousSecretExpiresAt),
              enabled: row.enabled,
            },
          } as const;
        } catch (err) {
          this.instrumentation.capture(err);
          return { ok: false, reason: "db_error" } as const;
        }
      },
    );
  }
}
