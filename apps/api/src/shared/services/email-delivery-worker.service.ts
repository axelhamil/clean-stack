import { type IUnitOfWork, Option } from "@packages/ddd-kit";
import { type EmailTemplateKey, renderTemplate } from "@packages/emails";
import { EventTypes } from "@packages/events";
import { DEFAULT_LOCALE } from "@packages/i18n";
import { Resend } from "resend";
import { env } from "../env";
import { EMAIL_SEND_TIMEOUT_SECONDS, EMAIL_SETTLE_MARGIN_SECONDS } from "../env-bounds";
import { emitEvent } from "../event-emitter";
import { failureSchedule } from "../jitter";
import { type Clock, leaseCountdown, monotonicClock, unitsWithinLease } from "../lease-budget";
import type { Logger } from "../logger";
import type { EmailFailure, EmailMessageRecord, IEmailQueue } from "../ports/email-queue.port";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository } from "../ports/outbox.port";

export const EMAIL_BATCH_CHUNK_SIZE = 100;
const POLL_INTERVAL_MS = 2_000;
const MAX_CHUNKS_PER_CLAIM = 3;
const EMAIL_MAX_ATTEMPTS = 4;
const CHUNK_BUDGET = {
  unitSeconds: EMAIL_SEND_TIMEOUT_SECONDS,
  marginSeconds: EMAIL_SETTLE_MARGIN_SECONDS,
};
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export const TEMPLATE_IDS: Record<string, string> = {
  verify_email: "",
  reset_password: "",
  magic_link: "",
  org_invitation: "",
  data_export_ready: "",
  delete_requested: "",
  delete_cancelled: "",
  delete_completed: "",
  change_email: "",
  backup_code_used: "",
  notification_digest: "",
};

type BatchEntry = Record<string, unknown>;
type BatchResult = {
  data: Array<{ id: string }> | null;
  errors?: Array<{ index: number; message: string }>;
  error: null | { statusCode?: number; message: string };
};
export interface EmailDeliveryOptions {
  leaseSeconds: number;
  deadRetrySeconds: number;
  deadReplayWindowHours: number;
}

interface BatchSender {
  batchSend(entries: BatchEntry[], idempotencyKey: Option<string>): Promise<BatchResult>;
}

interface ResendBatchClient {
  batch: {
    send(
      entries: never,
      options: { batchValidation: "permissive"; idempotencyKey?: string; signal: AbortSignal },
    ): Promise<
      | { data: { data: Array<{ id: string }>; errors?: BatchResult["errors"] }; error: null }
      | { data: null; error: { message: string; statusCode: number | null } }
    >;
  };
}

type Rendered =
  | { row: EmailMessageRecord; entry: BatchEntry }
  | { row: EmailMessageRecord; error: string };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class EmailDeliveryWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;
  private readonly sender: BatchSender;
  private readonly claimLimit: number;

  constructor(
    private readonly queue: IEmailQueue,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
    private readonly options: EmailDeliveryOptions,
    sender?: BatchSender,
    private readonly clock: Clock = monotonicClock,
  ) {
    this.sender =
      sender ??
      resendBatchSender(
        env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null,
        instrumentation,
        logger,
      );
    this.claimLimit =
      Math.min(MAX_CHUNKS_PER_CLAIM, unitsWithinLease(options.leaseSeconds, CHUNK_BUDGET)) *
      EMAIL_BATCH_CHUNK_SIZE;
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.timer = setInterval(() => this.drainInBackground(), POLL_INTERVAL_MS);
    this.logger.info("email delivery worker started");
    this.drainInBackground();
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
    this.logger.info("email delivery worker stopped");
  }

  /**
   * Fire-and-forget entry point for every drain nobody awaits. A rejection left
   * unhandled here would take the whole process down, and nothing inside
   * `drainOnce` reports a transaction that fails to open.
   */
  private drainInBackground(): void {
    this.drainOnce().catch((err) => {
      this.instrumentation.capture(err);
      this.logger.error({ err }, "email drain failed");
    });
  }

  async drainOnce(): Promise<void> {
    if (this.stopping || this.draining) return;
    this.draining = true;
    return this.instrumentation.startSpan({ name: "EmailDeliveryWorker > drainOnce" }, async () => {
      try {
        const lease = leaseCountdown(this.options.leaseSeconds, CHUNK_BUDGET, this.clock);
        const claimed = await this.queue.claim({
          limit: this.claimLimit,
          leaseSeconds: this.options.leaseSeconds,
          deadReplayWindowHours: this.options.deadReplayWindowHours,
        });
        if (claimed.isFailure) {
          this.logger.error({ err: claimed.getError() }, "email claim failed");
          return;
        }

        const chunks = groupRows(claimed.getValue()).flatMap((group) =>
          Array.from({ length: Math.ceil(group.length / EMAIL_BATCH_CHUNK_SIZE) }, (_, i) =>
            group.slice(i * EMAIL_BATCH_CHUNK_SIZE, (i + 1) * EMAIL_BATCH_CHUNK_SIZE),
          ),
        );
        for (const [index, chunk] of chunks.entries()) {
          if (this.stopping || (index > 0 && !lease.coversNextUnit()))
            return this.release(chunks.slice(index).flat());

          await this.sendChunk(chunk);
        }
      } finally {
        this.draining = false;
      }
    });
  }

  private async release(rows: EmailMessageRecord[]): Promise<void> {
    const released = await this.queue.release(rows);
    if (released.isFailure) {
      this.logger.error({ err: released.getError() }, "email release failed");
      return;
    }

    this.logger.info({ released: released.getValue() }, "email worker released unsent messages");
  }

  private async render(row: EmailMessageRecord): Promise<Rendered> {
    return this.toEntry(row).then(
      (entry) => ({ row, entry }),
      (err: unknown) => {
        this.instrumentation.capture(err);
        this.logger.error({ err, messageId: row.id }, "email render failed");
        return { row, error: `render failed: ${err instanceof Error ? err.message : String(err)}` };
      },
    );
  }

  private async sendChunk(claimed: EmailMessageRecord[]): Promise<void> {
    const chunk: EmailMessageRecord[] = [];
    const entries: BatchEntry[] = [];
    for (const rendered of await Promise.all(claimed.map((r) => this.render(r)))) {
      if ("error" in rendered) {
        await this.settleFailure(rendered.row, rendered.error, false);
        continue;
      }
      chunk.push(rendered.row);
      entries.push(rendered.entry);
    }
    if (chunk.length === 0) return;

    const result = await this.sender.batchSend(entries, await chunkIdempotencyKey(chunk));

    if (result.error !== null) {
      const status = result.error.statusCode ?? 500;
      const retryable = RETRYABLE_STATUSES.has(status) || status === 0;
      for (const r of chunk) {
        await this.settleFailure(r, `HTTP ${status}: ${result.error.message}`, retryable);
      }
      return;
    }

    const failures = new Map((result.errors ?? []).map((e) => [e.index, e.message]));
    const aligned = result.data !== null && result.data.length === chunk.length;
    const sent: EmailMessageRecord[] = [];
    const providerIds: Record<string, string> = {};

    for (const [index, r] of chunk.entries()) {
      const failure = failures.get(index);
      if (failure !== undefined) {
        await this.settleFailure(r, failure, false);
        continue;
      }
      sent.push(r);
      const providerId = aligned ? result.data?.[index]?.id : undefined;
      if (providerId) providerIds[r.id] = providerId;
    }

    if (sent.length === 0) return;

    const marked = await this.queue.markSent(sent, providerIds);
    if (marked.isFailure) {
      this.logger.error({ err: marked.getError() }, "email markSent failed");
      return;
    }
    if (marked.getValue().length < sent.length) {
      this.logger.warn(
        { sent: sent.length, settled: marked.getValue().length },
        "email markSent skipped messages whose lease was lost",
      );
    }
  }

  private failureOf(row: EmailMessageRecord, lastError: string, retryable: boolean): EmailFailure {
    if (!retryable) return { lastError, status: "failed" };

    const { dead, retryAfterSeconds } = failureSchedule(row.attempts, {
      wasDead: row.status === "dead",
      maxAttempts: EMAIL_MAX_ATTEMPTS,
      deadRetrySeconds: this.options.deadRetrySeconds,
    });

    return { lastError, status: dead ? "dead" : "pending", retryAfterSeconds };
  }

  private async settleFailure(
    row: EmailMessageRecord,
    lastError: string,
    retryable: boolean,
  ): Promise<void> {
    const failure = this.failureOf(row, lastError, retryable);
    const announces = failure.status !== "pending" && row.status !== "dead";
    const settled = await this.uow.run(async () => {
      const written = await this.queue.markFailed(row, failure);
      if (written.isFailure || !written.getValue() || !announces) return written;

      await emitEvent(
        this.outbox,
        EventTypes.EMAIL_DELIVERY_EXHAUSTED,
        "email_message",
        row.id,
        {
          messageId: row.id,
          template: row.template.toNull(),
          toHash: await sha256Hex(row.toAddress),
          attempts: row.attempts,
          lastError,
          actorUserId: null,
        },
        {},
      );
      return written;
    });
    if (settled.isFailure) {
      this.logger.error({ err: settled.getError(), messageId: row.id }, "markFailed failed");
    }
  }

  private async toEntry(rowRecord: EmailMessageRecord): Promise<BatchEntry> {
    const base = { from: env.RESEND_FROM, to: rowRecord.toAddress, subject: rowRecord.subject };

    if (rowRecord.kind === "raw") {
      const body = rowRecord.payload as { html?: string; text?: string };
      return { ...base, html: body.html ?? "", text: body.text };
    }

    const templateName = rowRecord.template.toNull();
    const templateId = templateName ? TEMPLATE_IDS[templateName] : "";
    if (templateId) {
      return {
        ...base,
        template: { id: templateId, variables: rowRecord.payload },
      };
    }

    const rendered = await renderTemplate(
      templateName as EmailTemplateKey,
      rowRecord.payload as never,
      rowRecord.locale.toUndefined() ?? DEFAULT_LOCALE,
    );
    return { ...base, html: rendered.html, text: rendered.text };
  }
}

export async function chunkIdempotencyKey(chunk: EmailMessageRecord[]): Promise<Option<string>> {
  const explicit = chunk
    .map((r) => r.idempotencyKey)
    .filter((k) => k.isSome())
    .map((k) => k.unwrap());
  if (explicit.length !== chunk.length) return Option.none();
  return Option.some(await sha256Hex(explicit.sort().join("|")));
}

export function groupRows(rows: EmailMessageRecord[]): EmailMessageRecord[][] {
  const groups = new Map<string, EmailMessageRecord[]>();
  for (const r of rows) {
    const key = `${r.kind}:${r.template.unwrapOr("")}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()];
}

export function resendBatchSender(
  client: ResendBatchClient | null,
  instrumentation: IInstrumentation,
  logger: Logger,
  timeoutMs: number = EMAIL_SEND_TIMEOUT_SECONDS * 1000,
): BatchSender {
  const timedOut = { statusCode: 0, message: `email batch send timed out after ${timeoutMs}ms` };

  return {
    async batchSend(entries: BatchEntry[], idempotencyKey: Option<string>): Promise<BatchResult> {
      if (!client) {
        for (const e of entries) {
          logger.info(
            { to: e.to, subject: e.subject },
            "[email-dev] not delivered: no RESEND_API_KEY",
          );
        }
        return { data: entries.map((_, i) => ({ id: `dev-${i}` })), error: null };
      }
      return instrumentation.startSpan(
        {
          name: "POST https://api.resend.com/emails/batch",
          op: "http.client",
          attributes: {
            "http.method": "POST",
            "http.host": "api.resend.com",
            "email.count": entries.length,
          },
        },
        async () => {
          const signal = AbortSignal.timeout(timeoutMs);
          try {
            const res = await client.batch.send(entries as never, {
              batchValidation: "permissive",
              signal,
              ...(idempotencyKey.isSome() ? { idempotencyKey: idempotencyKey.unwrap() } : {}),
            });
            if (signal.aborted) {
              instrumentation.capture(new Error(timedOut.message));
              return { data: null, error: timedOut };
            }
            if (res.error) {
              const status = res.error.statusCode ?? 500;
              if (status >= 500) instrumentation.capture(res.error);
              return { data: null, error: { statusCode: status, message: res.error.message } };
            }
            return { data: res.data.data, errors: res.data.errors ?? [], error: null };
          } catch (err) {
            instrumentation.capture(err);
            if (signal.aborted) return { data: null, error: timedOut };

            return {
              data: null,
              error: {
                statusCode: 0,
                message: err instanceof Error ? err.message : "network error",
              },
            };
          }
        },
      );
    },
  };
}
