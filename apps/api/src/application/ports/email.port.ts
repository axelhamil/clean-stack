import type { Result } from "@packages/ddd-kit";

export type TemplateVariables = Record<string, string | number>;

export type EmailTemplates = {
  verify_email: { name: string; verifyUrl: string };
  reset_password: { name: string; resetUrl: string };
  magic_link: { magicUrl: string };
};

export type EmailError =
  | { code: "EMAIL_TRANSPORT_NOT_CONFIGURED"; message: string }
  | { code: "EMAIL_PROVIDER_FAILURE"; message: string };

export interface SendTemplateOptions {
  idempotencyKey?: string;
  from?: string;
  locale?: string;
}

export interface IEmailService {
  sendTemplate<K extends keyof EmailTemplates>(
    template: K,
    to: string,
    variables: EmailTemplates[K] & TemplateVariables,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;
}
