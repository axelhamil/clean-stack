import { isPlatformAdmin } from "./is-platform-admin";

export function canAccessPlatformAdmin(session: { user?: unknown } | null | undefined): boolean {
  const user = session?.user as { twoFactorEnabled?: boolean } | undefined;
  return isPlatformAdmin(session) && Boolean(user?.twoFactorEnabled);
}
