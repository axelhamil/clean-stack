export function isImpersonating(session: { session?: unknown } | null | undefined): boolean {
  return Boolean(
    (session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy,
  );
}
