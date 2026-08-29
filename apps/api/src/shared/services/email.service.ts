import { Option, Result } from "@packages/ddd-kit";
import { type EmailTemplateKey, renderTemplate } from "@packages/emails";
import { DEFAULT_LOCALE } from "@packages/i18n";
import type {
  EmailBody,
  EmailError,
  EmailRecipient,
  EmailTemplates,
  IEmailService,
  SendTemplateOptions,
  TemplateVariables,
} from "../ports/email.port";
import type { EmailMessageInsert, IEmailQueue } from "../ports/email-queue.port";
import type { IInstrumentation } from "../ports/instrumentation.port";

export class QueuedEmailService implements IEmailService {
  constructor(
    private readonly queue: IEmailQueue,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async sendTemplate<K extends keyof EmailTemplates>(
    template: K,
    to: string,
    variables: EmailTemplates[K] & TemplateVariables,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>> {
    return this.instrumentation.startSpan({ name: "QueuedEmailService > sendTemplate" }, () =>
      this.sendTemplateBatch(template, [{ to, variables, locale: options?.locale }], options),
    );
  }

  async sendTemplateBatch<K extends keyof EmailTemplates>(
    template: K,
    recipients: EmailRecipient<K>[],
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>> {
    return this.instrumentation.startSpan(
      {
        name: "QueuedEmailService > sendTemplateBatch",
        attributes: { template: String(template) },
      },
      async () => {
        const rows: EmailMessageInsert[] = [];
        for (const [index, r] of recipients.entries()) {
          const locale = r.locale ?? DEFAULT_LOCALE;
          const rendered = await renderTemplate(
            template as EmailTemplateKey,
            r.variables as never,
            locale,
          );
          rows.push({
            kind: "template",
            template: Option.some(String(template)),
            toAddress: r.to,
            subject: rendered.subject,
            locale,
            payload: r.variables,
            idempotencyKey: r.idempotencyKey
              ? Option.some(r.idempotencyKey)
              : options?.idempotencyKey
                ? Option.some(`${options.idempotencyKey}#${index}`)
                : Option.none(),
          });
        }
        return this.enqueue(rows, options?.tx);
      },
    );
  }

  async sendRaw(
    to: string,
    subject: string,
    body: EmailBody,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>> {
    return this.instrumentation.startSpan({ name: "QueuedEmailService > sendRaw" }, () =>
      this.sendRawBatch([{ to, subject, body }], options),
    );
  }

  async sendRawBatch(
    messages: Array<{ to: string; subject: string; body: EmailBody }>,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>> {
    return this.instrumentation.startSpan(
      { name: "QueuedEmailService > sendRawBatch" },
      async () => {
        const rows: EmailMessageInsert[] = messages.map((m, index) => ({
          kind: "raw" as const,
          template: Option.none(),
          toAddress: m.to,
          subject: m.subject,
          locale: DEFAULT_LOCALE,
          payload: m.body,
          idempotencyKey: options?.idempotencyKey
            ? Option.some(`${options.idempotencyKey}/${index}`)
            : Option.none(),
        }));
        return this.enqueue(rows, options?.tx);
      },
    );
  }

  private async enqueue(
    rows: EmailMessageInsert[],
    tx: SendTemplateOptions["tx"],
  ): Promise<Result<void, EmailError>> {
    const written = await this.queue.enqueue(rows, tx);
    if (written.isFailure) {
      return Result.fail({
        code: "EMAIL_PROVIDER_FAILURE",
        message: written.getError().message,
      });
    }
    return Result.ok();
  }
}
