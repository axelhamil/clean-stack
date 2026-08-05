import { isImpersonating } from "../shared/auth/is-impersonating";

export function shouldRedirectToLegalAccept(
  session: Parameters<typeof isImpersonating>[0],
  policies: Record<string, { current: boolean }> | null | undefined,
): boolean {
  if (isImpersonating(session)) return false;
  return Boolean(policies && Object.values(policies).some((p) => !p.current));
}
