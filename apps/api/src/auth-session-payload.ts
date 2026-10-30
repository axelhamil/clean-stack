import type { StaffAccess } from "./shared/staff-access";

export function buildSessionPayload<
  U extends { id: string; locale?: string | null },
  S extends { id: string; impersonatedBy?: string | null; activeOrganizationId?: string | null },
>(user: U, session: S, staff: StaffAccess | null, activeOrganizationRole?: string | null) {
  const enrichedUser = { ...user, locale: user.locale ?? null } as U & {
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
  return { user: enrichedUser, session: enrichedSession, staff };
}
