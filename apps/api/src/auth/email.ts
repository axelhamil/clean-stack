import type { EmailTemplates, TemplateVariables } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { type Locale, toLocale } from "@packages/i18n";
import { CryptoHasher } from "bun";
import { localeForEmail } from "../shared/locale-for-user";
import type { AuthDeps } from "./deps";
import { redirectQuery } from "./email-redirect";
import type { Emit } from "./emit";
import { markPasswordResetDelivered } from "./password-reset-delivery";
import { requestClientIp } from "./visitor";

/**
 * Derives a stable idempotency key from an opaque BetterAuth token so that
 * retried email sends (e.g. Resend 5xx → retry) don't produce duplicate
 * deliveries. The token is hashed (SHA-256, first 32 hex chars) to avoid
 * storing a verifiable secret in provider logs.
 */
export function tokenIdempotencyKey(template: string, token: string): string {
  const hash = new CryptoHasher("sha256").update(token).digest("hex").slice(0, 32);
  return `${template}/${hash}`;
}

/**
 * The locale BetterAuth hands over on its user objects. `locale` is an additional field
 * the plugin types do not know about, hence the narrow read.
 */
export function localeOf(user: object): Locale {
  return toLocale((user as { locale?: unknown }).locale);
}

export type DispatchEmail = <K extends keyof EmailTemplates>(
  template: K,
  to: string,
  variables: EmailTemplates[K] & TemplateVariables,
  idempotencyKey: string,
  locale: Locale,
) => Promise<void>;

export function createMailer(deps: Pick<AuthDeps, "email" | "policies" | "logger">): {
  dispatchEmail: DispatchEmail;
  acceptStalePoliciesAtFirstVerification(userId: string): Promise<void>;
} {
  /**
   * Sends a transactional email through `IEmailService` and surfaces failures
   * as a thrown `Error`, the only signal available inside BetterAuth's
   * `async () => void` hook signature. Transport-not-configured is downgraded
   * to a warning (dev/test without Resend configured should not crash).
   */
  const dispatchEmail: DispatchEmail = async (template, to, variables, idempotencyKey, locale) => {
    const result = await deps.email.sendTemplate(template, to, variables, {
      idempotencyKey,
      locale,
    });
    if (result.isFailure) {
      const error = result.getError();
      if (error.code === "EMAIL_PROVIDER_FAILURE") {
        // BetterAuth hook signature is `async () => void`, no Result propagation possible; throw is the only signal.
        throw new Error(`email send failed (${template}): ${error.message}`);
      }
      deps.logger.warn(
        { template, to, code: error.code },
        "email skipped, transport not configured",
      );
    }
  };

  const acceptStalePoliciesAtFirstVerification = async (userId: string): Promise<void> => {
    const stale = await deps.policies.getStaleTypes(userId);
    if (stale.isFailure) {
      deps.logger.error(
        { err: stale.getError(), userId },
        "policy staleness check failed at verify-email",
      );
      return;
    }
    if (stale.getValue().length === 0) return;

    const ip = requestClientIp() ?? undefined;
    const recorded = await deps.policies.accept(userId, stale.getValue(), ip);
    if (recorded.isFailure) {
      deps.logger.error(
        { err: recorded.getError(), userId },
        "policy acceptance failed at verify-email",
      );
    }
  };

  return { dispatchEmail, acceptStalePoliciesAtFirstVerification };
}

export interface EmailUser {
  id: string;
  email: string;
  name: string;
}

export interface EmailFlows {
  sendChangeEmailConfirmation(data: {
    user: EmailUser;
    newEmail: string;
    url: string;
    token: string;
  }): Promise<void>;
  sendResetPassword(data: { user: EmailUser; token: string }): Promise<void>;
  beforeEmailVerification(user: { id: string }): Promise<void>;
  sendVerificationEmail(data: { user: EmailUser; url: string; token: string }): Promise<void>;
  sendMagicLink(data: { email: string; token: string; url: string }): Promise<void>;
}

export function createEmailFlows(
  deps: Pick<AuthDeps, "uow" | "profiles" | "queries" | "settings">,
  parts: {
    emit: Emit;
    dispatchEmail: DispatchEmail;
    acceptStalePoliciesAtFirstVerification: (userId: string) => Promise<void>;
  },
): EmailFlows {
  const { emit, dispatchEmail, acceptStalePoliciesAtFirstVerification } = parts;
  const { appUrl, adminUrl } = deps.settings;

  return {
    sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
      await deps.uow.run(async () => {
        await deps.queries.setPendingEmail(user.id, newEmail);
        await emit(
          EventTypes.USER_EMAIL_CHANGE_REQUESTED,
          "user",
          user.id,
          { userId: user.id, newEmail },
          null,
        );
      });
      await dispatchEmail(
        "change_email",
        user.email,
        { name: user.name ?? "", newEmail, confirmUrl: url },
        tokenIdempotencyKey("change-email", token),
        localeOf(user),
      );
    },

    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await emit(EventTypes.USER_PASSWORD_RESET_REQUESTED, "user", user.id, {
        userId: user.id,
        email: user.email,
      });
      await dispatchEmail(
        "reset_password",
        user.email,
        { name: user.name ?? "", resetUrl },
        tokenIdempotencyKey("reset-password", token),
        localeOf(user),
      );
      markPasswordResetDelivered();
    },

    beforeEmailVerification: async (user) => {
      await acceptStalePoliciesAtFirstVerification(user.id);
    },

    sendVerificationEmail: async ({ user, url, token }) => {
      const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(token)}${redirectQuery(url, adminUrl)}`;
      await dispatchEmail(
        "verify_email",
        user.email,
        { name: user.name ?? "", verifyUrl },
        tokenIdempotencyKey("verify-email", token),
        localeOf(user),
      );
    },

    sendMagicLink: async ({ email, token, url }) => {
      const magicUrl = `${appUrl}/magic-link?token=${encodeURIComponent(token)}${redirectQuery(url, adminUrl)}`;
      await emit(EventTypes.USER_MAGIC_LINK_REQUESTED, "user", email, { email });
      await dispatchEmail(
        "magic_link",
        email,
        { magicUrl },
        tokenIdempotencyKey("magic-link", token),
        await localeForEmail(deps.profiles, email),
      );
    },
  };
}
