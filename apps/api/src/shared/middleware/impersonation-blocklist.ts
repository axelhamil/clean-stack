const ALWAYS_ALLOWED = ["/admin/stop-impersonating"];

export const IMPERSONATION_BLOCKED_PATHS: readonly string[] = [
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/set-password",
  "/two-factor",
  "/passkey",
  "/link-social",
  "/unlink-account",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/admin",
  "/sso",
  "/scim",
];

export function isBlockedDuringImpersonation(path: string): boolean {
  if (ALWAYS_ALLOWED.some((allowed) => path === allowed)) return false;
  return IMPERSONATION_BLOCKED_PATHS.some(
    (blocked) => path === blocked || path.startsWith(`${blocked}/`),
  );
}

/**
 * BetterAuth's admin-plugin endpoint that mints a session for another user.
 * Named here (rather than inlined at the call site) because the SSO-enforcement
 * guard in `databaseHooks.session.create.before` has to recognize it: that
 * session is minted for a platform admin who already passed the admin gate, not
 * by the enforced user authenticating, so enforcement does not apply to it.
 */
export const IMPERSONATE_PATH = "/admin/impersonate-user";
