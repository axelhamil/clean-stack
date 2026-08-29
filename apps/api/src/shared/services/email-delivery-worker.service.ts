import { Option } from "@packages/ddd-kit";
import { db } from "@packages/drizzle";
import { type EmailTemplateKey, renderTemplate } from "@packages/emails";
import { EventTypes } from "@packages/events";
import { DEFAULT_LOCALE } from "@packages/i18n";
import { Resend } from "resend";
import { env } from "../env";
import { emitEvent } from "../event-emitter";
import { JITTER_BASE_MS, JITTER_MULTIPLIER, nextAttemptAt } from "../jitter";
import type { Logger } from "../logger";
import type { EmailMessageRecord, IEmailQueue } from "../ports/email-queue.port";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { ITransaction } from "../transaction";

export const EMAIL_BATCH_CHUNK_SIZE = 100;
const POLL_INTERVAL_MS = 2_000;
const CLAIM_LIMIT = 300;
const CLAIM_WINDOW_MS = 120_000;
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
interface BatchSender {
  batchSend(entries: BatchEntry[], idempotencyKey: string | null): Promise<BatchResult>;
}

function expectedDelayFromAttempts(currentAttempts: number): number {
  return JITTER_BASE_MS * JITTER_MULTIPLIER ** Math.max(0, currentAttempts);
}

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

  constructor(
    private readonly queue: IEmailQueue,
    private readonly outbox: IOutboxRepository,
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
    sender?: BatchSender,
  ) {
    this.sender = sender ?? makeResendSender(instrumentation, logger);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.timer = setInterval(() => {
      this.drainOnce().catch((err) => this.logger.error({ err }, "email drain failed"));
    }, POLL_INTERVAL_MS);
    this.logger.info("email delivery worker started");
    void this.drainOnce();
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

  async drainOnce(): Promise<void> {
    if (this.stopping || this.draining) return;
    this.draining = true;
    return this.instrumentation.startSpan({ name: "EmailDeliveryWorker > drainOnce" }, async () => {
      try {
        const claimed = await db.transaction((tx) =>
          this.queue.claimPending(CLAIM_LIMIT, new Date(Date.now() + CLAIM_WINDOW_MS), tx),
        );
        if (claimed.isFailure) {
          this.logger.error({ err: claimed.getError() }, "email claimPending failed");
          return;
        }
        const rows = claimed.getValue();
        if (rows.length === 0) return;

        for (const group of groupRows(rows)) {
          for (let i = 0; i < group.length; i += EMAIL_BATCH_CHUNK_SIZE) {
            if (this.stopping) return;
            await this.sendChunk(group.slice(i, i + EMAIL_BATCH_CHUNK_SIZE));
          }
        }
      } finally {
        this.draining = false;
      }
    });
  }

  private async sendChunk(chunk: EmailMessageRecord[]): Promise<void> {
    const entries = await Promise.all(chunk.map((r) => this.toEntry(r)));
    const keyOpt = chunkIdempotencyKey(chunk);
    const result = await this.sender.batchSend(entries, keyOpt.isSome() ? keyOpt.unwrap() : null);

    if (result.error !== null) {
      const status = result.error.statusCode ?? 500;
      const retryable = RETRYABLE_STATUSES.has(status) || status === 0;
      for (const r of chunk) {
        await (retryable
          ? this.reschedule(r, `HTTP ${status}: ${result.error.message}`)
          : this.fail(r, `HTTP ${status}: ${result.error.message}`));
      }
      return;
    }

    const failures = new Map((result.errors ?? []).map((e) => [e.index, e.message]));
    const aligned = result.data !== null && result.data.length === chunk.length;
    const sentIds: string[] = [];
    const providerIds: Record<string, string> = {};

    for (const [index, r] of chunk.entries()) {
      const failure = failures.get(index);
      if (failure !== undefined) {
        await this.fail(r, failure);
        continue;
      }
      sentIds.push(r.id);
      const providerId = aligned ? result.data?.[index]?.id : undefined;
      if (providerId) providerIds[r.id] = providerId;
    }

    if (sentIds.length > 0) {
      await db.transaction((tx) => this.queue.markSent(sentIds, new Date(), providerIds, tx));
    }
  }

  private async fail(rowRecord: EmailMessageRecord, error: string): Promise<void> {
    return this.settle(rowRecord, error, Option.none());
  }

  private async reschedule(rowRecord: EmailMessageRecord, error: string): Promise<void> {
    const attempts = rowRecord.attempts + 1;
    const { date } = nextAttemptAt(attempts, expectedDelayFromAttempts(attempts));
    return this.settle(rowRecord, error, Option.fromNullable(date));
  }

  private async settle(
    rowRecord: EmailMessageRecord,
    error: string,
    date: Option<Date>,
  ): Promise<void> {
    const attempts = rowRecord.attempts + 1;
    await db.transaction(async (tx) => {
      const marked = await this.queue.markFailed(rowRecord.id, error, date, tx);
      if (marked.isFailure) {
        this.logger.error({ err: marked.getError(), messageId: rowRecord.id }, "markFailed failed");
        return;
      }
      if (date.isSome()) return;
      await emitEvent(
        this.outbox,
        EventTypes.EMAIL_DELIVERY_EXHAUSTED,
        "email_message",
        rowRecord.id,
        {
          messageId: rowRecord.id,
          template: rowRecord.template.isSome() ? rowRecord.template.unwrap() : null,
          toHash: await sha256Hex(rowRecord.toAddress),
          attempts,
          lastError: error,
          actorUserId: null,
        },
        {},
        tx as ITransaction,
      );
    });
  }

  private async toEntry(rowRecord: EmailMessageRecord): Promise<BatchEntry> {
    const base = { from: env.RESEND_FROM, to: rowRecord.toAddress, subject: rowRecord.subject };

    if (rowRecord.kind === "raw") {
      const body = rowRecord.payload as { html?: string; text?: string };
      return { ...base, html: body.html ?? "", text: body.text };
    }

    const templateName = rowRecord.template.isSome() ? rowRecord.template.unwrap() : null;
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
      rowRecord.locale ?? DEFAULT_LOCALE,
    );
    return { ...base, html: rendered.html, text: rendered.text };
  }
}

export function chunkIdempotencyKey(chunk: EmailMessageRecord[]): Option<string> {
  const explicit = chunk
    .map((r) => r.idempotencyKey)
    .filter((k) => k.isSome())
    .map((k) => k.unwrap());
  if (explicit.length !== chunk.length) return Option.none();
  return Option.some(explicit.sort().join("|").slice(0, 256));
}

export function groupRows(rows: EmailMessageRecord[]): EmailMessageRecord[][] {
  const groups = new Map<string, EmailMessageRecord[]>();
  for (const r of rows) {
    const key = `${r.kind}:${r.template.isSome() ? r.template.unwrap() : ""}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()];
}

function makeResendSender(instrumentation: IInstrumentation, logger: Logger): BatchSender {
  const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  return {
    async batchSend(entries: BatchEntry[], idempotencyKey: string | null): Promise<BatchResult> {
      if (!client) {
        for (const e of entries) {
          logger.info(
            { to: e.to, subject: e.subject },
            "[email-dev] not delivered — no RESEND_API_KEY",
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
          try {
            const res = await client.batch.send(entries as never, {
              batchValidation: "permissive",
              ...(idempotencyKey ? { idempotencyKey } : {}),
            });
            if (res.error) {
              const status = (res.error as { statusCode?: number }).statusCode ?? 500;
              if (status >= 500) instrumentation.capture(res.error);
              return { data: null, error: { statusCode: status, message: res.error.message } };
            }
            return {
              data: res.data?.data ?? [],
              errors:
                (res.data as { errors?: Array<{ index: number; message: string }> })?.errors ?? [],
              error: null,
            };
          } catch (err) {
            instrumentation.capture(err);
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
