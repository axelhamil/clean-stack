import { Result } from "@packages/ddd-kit";
import { Resend } from "resend";
import { env } from "../env";
import { logger } from "../logger";
import type {
  EmailError,
  EmailTemplates,
  IEmailService,
  SendTemplateOptions,
  TemplateVariables,
} from "../ports/email.port";

// Resend dashboard handles — fill when cloning. Empty = transport not configured (prod boots fail-hard, dev drops with a warn).
const TEMPLATE_IDS: Record<keyof EmailTemplates, string> = {
  verify_email: "",
  reset_password: "",
  magic_link: "",
  org_invitation: "",
  data_export_ready: "",
  delete_requested: "",
  delete_cancelled: "",
  delete_completed: "",
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

const STATUS_HINTS: Record<number, string> = {
  401: "resend auth failure — check RESEND_API_KEY",
  403: "resend forbidden — verify sending domain configuration",
  409: "resend idempotency conflict — same key with different payload, check template variables",
  422: "resend validation failure — likely template variable mismatch in dashboard",
};

type ResendSendPayload = Parameters<Resend["emails"]["send"]>[0];
type AttemptOutcome = { ok: true } | { ok: false; status: number; message: string };

export class ResendEmailService implements IEmailService {
  private readonly resend: Resend | null;

  constructor() {
    this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

    const isProd = env.NODE_ENV === "production";
    const missing = Object.entries(TEMPLATE_IDS)
      .filter(([, id]) => !id)
      .map(([key]) => key);

    if (isProd && (!this.resend || missing.length > 0)) {
      throw new Error(
        `Email service misconfigured in production: ${
          !this.resend ? "RESEND_API_KEY missing" : `template IDs missing: ${missing.join(", ")}`
        }`,
      );
    }

    if (!this.resend) {
      logger.warn("RESEND_API_KEY not set — emails will be logged to stdout (dev fallback)");
      return;
    }

    if (missing.length > 0) {
      logger.warn(
        { missing },
        "missing RESEND template IDs — emails for these templates will be logged in dev, dropped otherwise",
      );
    }
  }

  async sendTemplate<K extends keyof EmailTemplates>(
    template: K,
    to: string,
    variables: EmailTemplates[K] & TemplateVariables,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>> {
    const templateId = TEMPLATE_IDS[template];
    if (!this.resend || !templateId) {
      if (env.NODE_ENV !== "production") {
        logger.info(
          { template, to, variables, idempotencyKey: options?.idempotencyKey },
          "[email-dev] transport not configured — payload logged",
        );
        return Result.ok();
      }
      return Result.fail({
        code: "EMAIL_TRANSPORT_NOT_CONFIGURED",
        message: `transport missing for template "${template}"`,
      });
    }

    if (options?.locale) {
      logger.warn(
        { template, locale: options.locale },
        "locale-aware templates not yet implemented — using default template",
      );
    }

    const payload: ResendSendPayload = {
      from: options?.from ?? env.RESEND_FROM,
      to,
      template: { id: templateId, variables },
      ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const outcome = await this.attemptSend(payload);
      if (outcome.ok) return Result.ok();

      const isLast = attempt === MAX_ATTEMPTS;
      const retryable = outcome.status === 0 || RETRYABLE_STATUSES.has(outcome.status);

      if (!retryable || isLast) {
        const hint = STATUS_HINTS[outcome.status] ?? "resend email send failed";
        logger.error(
          {
            to,
            template,
            status: outcome.status,
            message: outcome.message,
            attempt,
          },
          hint,
        );
        return Result.fail({
          code: "EMAIL_PROVIDER_FAILURE",
          message: outcome.message,
        });
      }

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn(
        {
          to,
          template,
          status: outcome.status,
          attempt,
          nextDelayMs: delay,
        },
        "retrying email send",
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    return Result.fail({
      code: "EMAIL_PROVIDER_FAILURE",
      message: "exhausted retries",
    });
  }

  private async attemptSend(payload: ResendSendPayload): Promise<AttemptOutcome> {
    if (!this.resend) {
      return { ok: false, status: 0, message: "resend client not initialized" };
    }
    try {
      const { error } = await this.resend.emails.send(payload);
      if (!error) return { ok: true };
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return { ok: false, status, message: error.message ?? "unknown" };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        message: e instanceof Error ? e.message : "network error",
      };
    }
  }
}
