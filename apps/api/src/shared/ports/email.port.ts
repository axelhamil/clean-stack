import type { Result } from "@packages/ddd-kit";
import type { EmailTemplates } from "@packages/emails";
import type { Locale } from "@packages/i18n";
import type { ITransaction } from "../transaction";

export type { EmailTemplates };
export type TemplateVariables = Record<string, string | number>;

export interface EmailBody {
  html?: string;
  text?: string;
}

export type EmailError =
  | { code: "EMAIL_TRANSPORT_NOT_CONFIGURED"; message: string }
  | { code: "EMAIL_PROVIDER_FAILURE"; message: string };

export interface SendTemplateOptions {
  idempotencyKey?: string;
  from?: string;
  tx?: ITransaction;
}

export interface EmailRecipient<K extends keyof EmailTemplates> {
  to: string;
  variables: EmailTemplates[K] & TemplateVariables;
  locale?: Locale;
}

export interface IEmailService {
  sendTemplate<K extends keyof EmailTemplates>(
    template: K,
    to: string,
    variables: EmailTemplates[K] & TemplateVariables,
    locale?: Locale,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;

  sendRaw(
    to: string,
    subject: string,
    body: EmailBody,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;

  sendTemplateBatch<K extends keyof EmailTemplates>(
    template: K,
    recipients: EmailRecipient<K>[],
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;

  sendRawBatch(
    messages: Array<{ to: string; subject: string; body: EmailBody }>,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;
}
