import type { EmailTemplates, TemplateVariables } from "@packages/email/email.port";
import { DEFAULT_LOCALE, type Locale, toLocale } from "@packages/i18n";
import { CryptoHasher } from "bun";
import { di } from "../container";
import { logger } from "../shared/logger";
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

/**
 * Resolves the locale to write a message in when the hook only hands over an
 * address. Magic-link sign-in is the one auth flow with no user object in
 * scope; an address with no account yet legitimately falls back to the
 * default rather than failing the send.
 */
export async function localeForEmail(email: string): Promise<Locale> {
  const found = await di.IProfileStore.findLocaleByEmail(email);
  if (found.isFailure) return DEFAULT_LOCALE;
  const locale = found.getValue();
  return locale.isSome() ? locale.unwrap() : DEFAULT_LOCALE;
}

/**
 * Sends a transactional email through `IEmailService` and surfaces failures
 * as a thrown `Error`, the only signal available inside BetterAuth's
 * `async () => void` hook signature. Transport-not-configured is downgraded
 * to a warning (dev/test without Resend configured should not crash).
 */
export async function dispatchEmail<K extends keyof EmailTemplates>(
  template: K,
  to: string,
  variables: EmailTemplates[K] & TemplateVariables,
  idempotencyKey: string,
  locale: Locale,
): Promise<void> {
  const result = await di.IEmailService.sendTemplate(template, to, variables, {
    idempotencyKey,
    locale,
  });
  if (result.isFailure) {
    const error = result.getError();
    if (error.code === "EMAIL_PROVIDER_FAILURE") {
      // BetterAuth hook signature is `async () => void`, no Result propagation possible; throw is the only signal.
      throw new Error(`email send failed (${template}): ${error.message}`);
    }
    logger.warn({ template, to, code: error.code }, "email skipped, transport not configured");
  }
}

export async function acceptStalePoliciesAtFirstVerification(userId: string): Promise<void> {
  const stale = await di.PolicyAcceptanceService.getStaleTypes(userId);
  if (stale.isFailure) {
    logger.error(
      { err: stale.getError(), userId },
      "policy staleness check failed at verify-email",
    );
    return;
  }
  if (stale.getValue().length === 0) return;

  const ip = requestClientIp() ?? undefined;
  const recorded = await di.PolicyAcceptanceService.accept(userId, stale.getValue(), ip);
  if (recorded.isFailure) {
    logger.error({ err: recorded.getError(), userId }, "policy acceptance failed at verify-email");
  }
}
