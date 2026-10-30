import { messageFromCode, rateLimitedMessage } from "@packages/web-kit/api/errors/messages";
import { isExternalRedirect } from "@packages/web-kit/auth/safe-redirect";
import type { TFunction } from "i18next";
import { authClient } from "../../shared/auth/auth-client";

interface BetterAuthError {
  status?: number;
  message?: string;
  code?: string;
  providerId?: string;
  error?: { code?: string };
}

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
  const code = error.code ?? error.error?.code;
  if (code) {
    const mapped = messageFromCode(code, tErrors);
    if (mapped) return mapped;
  }
  return t(fallbackKey as never);
}

export function ssoCallbackUrl(redirectTo?: string): string {
  if (redirectTo && isExternalRedirect(redirectTo)) return redirectTo;

  return `${window.location.origin}${redirectTo ?? "/dashboard"}`;
}

/**
 * The user did nothing wrong: their organization enforces SSO for this domain.
 * Every email-bearing sign-in/sign-up path can reject with the same `SSO_REQUIRED`
 * shape, so redirecting into the SSO flow instead of showing an error is
 * shared here rather than duplicated per call site. `providerId` comes straight off
 * the server's rejection (confirmed to survive serialization), never re-derived
 * from the email. Returns `true` once the SSO redirect has been kicked off; the
 * caller should throw `SSO_REDIRECT_IN_PROGRESS` and swallow it in `onError` so no
 * error toast flashes before the browser navigates away.
 */
export async function redirectToSsoIfRequired(
  error: BetterAuthError,
  redirectTo?: string,
): Promise<boolean> {
  if (error.message !== "SSO_REQUIRED" || !error.providerId) return false;

  const { error: ssoError } = await authClient.signIn.sso({
    providerId: error.providerId,
    callbackURL: ssoCallbackUrl(redirectTo),
  });

  return !ssoError;
}
