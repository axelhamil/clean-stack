import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type { DeletionState } from "../../../domain/deletion/value-objects/deletion-state.vo";

export type RgpdError = AppError<
  | "ACCOUNT_DELETION_BLOCKED"
  | "ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN"
  | "ACCOUNT_DELETION_NOT_FOUND"
  | "ACCOUNT_EXPORT_RATE_LIMITED"
  | "ACCOUNT_PASSWORD_INVALID"
  | "ACCOUNT_PASSWORD_REQUIRED"
  | "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE"
  | "ACCOUNT_WIPE_PROVIDER_FAILURE"
  | "ADMIN_STAFF_PROVIDER_FAILURE"
  | "RGPD_REPOSITORY_PROVIDER_FAILURE"
  | "TOTP_VERIFIER_PROVIDER_FAILURE"
  | "TWO_FACTOR_REQUIRED"
  | "TWO_FACTOR_INVALID"
>;

export interface UserDeletionState {
  email: string;
  name: string;
  locale: Option<Locale>;
  twoFactorEnabled: boolean;
  deletion: DeletionState;
  lastExportRequestedAt: Option<Date>;
}

export interface PendingDeletionRow {
  userId: string;
  email: string;
  pendingDeletionUntil: Date;
}

export interface IDeletionStateRepository {
  findByUser(userId: string): Promise<Result<Option<UserDeletionState>, RgpdError>>;
  markPending(userId: string, until: Date): Promise<Result<void, RgpdError>>;
  clearPending(userId: string): Promise<Result<void, RgpdError>>;
  findReadyForWipe(limit: number): Promise<Result<PendingDeletionRow[], RgpdError>>;
  touchExportRequestedAt(userId: string): Promise<Result<void, RgpdError>>;
}
