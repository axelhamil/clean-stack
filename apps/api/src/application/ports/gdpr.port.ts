import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { Transaction } from "@packages/drizzle";

export type GdprError = AppError<
  | "ACCOUNT_DELETION_BLOCKED"
  | "ACCOUNT_DELETION_NOT_FOUND"
  | "ACCOUNT_EXPORT_RATE_LIMITED"
  | "ACCOUNT_PASSWORD_INVALID"
  | "ACCOUNT_PASSWORD_REQUIRED"
  | "ACCOUNT_WIPE_PROVIDER_FAILURE"
  | "GDPR_REPOSITORY_PROVIDER_FAILURE"
  | "TWO_FACTOR_REQUIRED"
  | "TWO_FACTOR_INVALID"
>;

export interface SoleOwnedOrgWithMembers {
  orgId: string;
  orgName: string;
  otherMembersCount: number;
}

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

export interface ExecuteWipeOutput {
  deletedOrgIds: string[];
  anonymizedEmail: string;
}

export interface PendingDeletionRow {
  userId: string;
  email: string;
  pendingDeletionUntil: Date;
}

export interface UserDeletionState {
  email: string;
  name: string;
  twoFactorEnabled: boolean;
  pendingDeletionUntil: Date | null;
  deletedAt: Date | null;
  lastExportRequestedAt: Date | null;
}

export interface IGdprRepository {
  findSoleOwnedNonPersonalOrgsWithMembers(
    userId: string,
    tx?: Transaction,
  ): Promise<Result<SoleOwnedOrgWithMembers[], GdprError>>;

  collectUserDataForExport(
    userId: string,
    tx?: Transaction,
  ): Promise<Result<UserExportPayload, GdprError>>;

  markPendingDeletion(
    userId: string,
    until: Date,
    tx?: Transaction,
  ): Promise<Result<void, GdprError>>;

  clearPendingDeletion(userId: string, tx?: Transaction): Promise<Result<void, GdprError>>;

  findUsersReadyForWipe(
    limit: number,
    tx?: Transaction,
  ): Promise<Result<PendingDeletionRow[], GdprError>>;

  executeWipe(userId: string, trx: Transaction): Promise<Result<ExecuteWipeOutput, GdprError>>;

  verifyPassword(
    userId: string,
    password: string,
    tx?: Transaction,
  ): Promise<Result<boolean, GdprError>>;

  verifyTotp(userId: string, code: string, tx?: Transaction): Promise<Result<boolean, GdprError>>;

  touchExportRequestedAt(userId: string, tx?: Transaction): Promise<Result<void, GdprError>>;

  getUserDeletionState(
    userId: string,
    tx?: Transaction,
  ): Promise<Result<Option<UserDeletionState>, GdprError>>;
}
