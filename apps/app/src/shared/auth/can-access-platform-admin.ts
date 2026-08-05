export function canAccessPlatformAdmin(session: { user?: unknown } | null | undefined): boolean {
  const user = session?.user as
    | { isPlatformAdmin?: boolean; twoFactorEnabled?: boolean }
    | undefined;
  return Boolean(user?.isPlatformAdmin && user?.twoFactorEnabled);
}
