import type { UserDataRecords } from "../ports/repositories/user-data-export.port";

export interface UserExportPayload {
  exportedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: string;
    updatedAt: string;
    twoFactorEnabled: boolean | null;
  };
  sessions: Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress: string | null;
    country: string | null;
    userAgent: string | null;
  }>;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
    joinedAt: string;
  }>;
  invitationsSent: Array<{
    id: string;
    organizationId: string;
    email: string;
    role: string | null;
    status: string;
    createdAt: string;
  }>;
}

export function toUserExportPayload(records: UserDataRecords, exportedAt: Date): UserExportPayload {
  const { user, sessions, memberships, invitationsSent } = records;

  return {
    exportedAt: exportedAt.toISOString(),
    user: {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    sessions: sessions.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    })),
    memberships: memberships.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    invitationsSent: invitationsSent.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  };
}
