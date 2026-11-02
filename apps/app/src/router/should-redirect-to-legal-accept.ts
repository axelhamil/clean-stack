import { isImpersonating } from "../shared/auth/is-impersonating";

export function shouldRedirectToLegalAccept(
  session: Parameters<typeof isImpersonating>[0],
  policies: Record<string, { current: boolean }> | null | undefined,
): boolean {
  if (isImpersonating(session)) return false;
  if (!policies) return true;

  return Object.values(policies).some((p) => !p.current);
}
