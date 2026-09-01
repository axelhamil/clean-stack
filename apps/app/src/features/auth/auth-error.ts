import type { TFunction } from "i18next";
import { messageFromCode, rateLimitedMessage } from "../../shared/api/errors/messages";
import { authClient } from "../../shared/auth/auth-client";

interface BetterAuthError {
  status?: number;
  message?: string;
  code?: string;
  providerId?: string;
}

export const SSO_REDIRECT_IN_PROGRESS = "sso-redirect-in-progress";

/**
 * BetterAuth errors stop surfacing the raw server string and go through the
 * same code-keyed `errors` catalog as the API errors, so there is one
 * translation store rather than two.
 */
export function resolveAuthError(
  error: BetterAuthError,
  fallbackKey: string,
  t: TFunction<"auth">,
  tErrors: TFunction<"errors">,
): string {
  if (error.status === 429) return rateLimitedMessage(tErrors);
  if (error.code) {
    const mapped = messageFromCode(error.code, tErrors);
    if (mapped) return mapped;
  }
  return t(fallbackKey as never);
}

/**
 * The user did nothing wrong — their organization enforces SSO for this domain.
 * Every email-bearing sign-in/sign-up path can reject with the same `SSO_REQUIRED`
 * shape (Task 9), so redirecting into the SSO flow instead of showing an error is
 * shared here rather than duplicated per call site. `providerId` comes straight off
 * the server's rejection (confirmed to survive serialization), never re-derived
 * from the email. Returns `true` once the SSO redirect has been kicked off — the
 * caller should throw `SSO_REDIRECT_IN_PROGRESS` and swallow it in `onError` so no
 * error toast flashes before the browser navigates away.
 */
export async function redirectToSsoIfRequired(error: BetterAuthError): Promise<boolean> {
  if (error.message !== "SSO_REQUIRED" || !error.providerId) return false;

  const { error: ssoError } = await authClient.signIn.sso({
    providerId: error.providerId,
    callbackURL: `${window.location.origin}/dashboard`,
  });

  return !ssoError;
}
