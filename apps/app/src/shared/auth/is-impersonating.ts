export function isImpersonating(session: { session?: unknown } | null | undefined): boolean {
  const inner = session?.session;
  if (typeof inner !== "object" || inner === null || !("impersonatedBy" in inner)) return false;
  return Boolean(inner.impersonatedBy);
}
