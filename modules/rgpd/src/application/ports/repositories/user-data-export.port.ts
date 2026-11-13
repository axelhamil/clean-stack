import type { Result } from "@packages/ddd-kit";
import type { RgpdError } from "./deletion-state.port";

export interface UserDataRecords {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
    twoFactorEnabled: boolean | null;
  };
  sessions: Array<{
    id: string;
    createdAt: Date;
    expiresAt: Date;
    ipAddress: string | null;
    country: string | null;
    userAgent: string | null;
  }>;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
    joinedAt: Date;
  }>;
  invitationsSent: Array<{
    id: string;
    organizationId: string;
    email: string;
    role: string | null;
    status: string;
    createdAt: Date;
  }>;
}

export interface IUserDataExportReader {
  collect(userId: string): Promise<Result<UserDataRecords, RgpdError>>;
}
