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
