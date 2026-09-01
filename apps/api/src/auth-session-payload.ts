export function buildSessionPayload<
  U extends { id: string; role?: string | null; locale?: string | null },
  S extends { id: string; impersonatedBy?: string | null; activeOrganizationId?: string | null },
>(user: U, session: S, platformAdminIds: string[], activeOrganizationRole?: string | null) {
  const isPlatformAdmin = platformAdminIds.includes(user.id) || user.role === "admin";
  const enrichedUser = { ...user, isPlatformAdmin, locale: user.locale ?? null } as U & {
    isPlatformAdmin: boolean;
    locale: string | null;
  };
  const enrichedSession = {
    ...session,
    impersonatedBy: session.impersonatedBy ?? null,
    ...(activeOrganizationRole !== undefined ? { activeOrganizationRole } : {}),
  } as Omit<S, "impersonatedBy"> & {
    impersonatedBy: string | null;
    activeOrganizationRole?: string | null;
  };
  return { user: enrichedUser, session: enrichedSession };
}
