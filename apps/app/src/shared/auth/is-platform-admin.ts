export function isPlatformAdmin(session: { user?: unknown } | null | undefined): boolean {
  return Boolean((session?.user as { isPlatformAdmin?: boolean } | undefined)?.isPlatformAdmin);
}
