import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../../../../shared/transaction";

export type RgpdError = AppError<
  | "ACCOUNT_DELETION_BLOCKED"
  | "ACCOUNT_DELETION_NOT_FOUND"
  | "ACCOUNT_EXPORT_RATE_LIMITED"
  | "ACCOUNT_PASSWORD_INVALID"
  | "ACCOUNT_PASSWORD_REQUIRED"
  | "ACCOUNT_WIPE_PROVIDER_FAILURE"
  | "RGPD_REPOSITORY_PROVIDER_FAILURE"
  | "TWO_FACTOR_REQUIRED"
  | "TWO_FACTOR_INVALID"
>;

export interface SoleOwnedOrgWithMembers {
  orgId: string;
  orgName: string;
  otherMembersCount: number;
}

// Wire-format DTO serialized to JSON in the user's data export archive (RGPD).
// `null` is intentional here: this leaves the application boundary as raw JSON,
// where `null` is the canonical representation of absence — `Option<T>` would
// serialize to `{ _tag: "None" }` and break consumers reading the export file.
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
  pendingDeletionUntil: Option<Date>;
  deletedAt: Option<Date>;
  lastExportRequestedAt: Option<Date>;
}

export interface IRgpdRepository {
  findSoleOwnedNonPersonalOrgsWithMembers(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<SoleOwnedOrgWithMembers[], RgpdError>>;

  collectUserDataForExport(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<UserExportPayload, RgpdError>>;

  markPendingDeletion(
    userId: string,
    until: Date,
    tx?: ITransaction,
  ): Promise<Result<void, RgpdError>>;

  clearPendingDeletion(userId: string, tx?: ITransaction): Promise<Result<void, RgpdError>>;

  findUsersReadyForWipe(
    limit: number,
    tx?: ITransaction,
  ): Promise<Result<PendingDeletionRow[], RgpdError>>;

  executeWipe(userId: string, tx: ITransaction): Promise<Result<ExecuteWipeOutput, RgpdError>>;

  verifyPassword(
    userId: string,
    password: string,
    tx?: ITransaction,
  ): Promise<Result<boolean, RgpdError>>;

  verifyTotp(userId: string, code: string, tx?: ITransaction): Promise<Result<boolean, RgpdError>>;

  touchExportRequestedAt(userId: string, tx?: ITransaction): Promise<Result<void, RgpdError>>;

  getUserDeletionState(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<UserDeletionState>, RgpdError>>;
}
