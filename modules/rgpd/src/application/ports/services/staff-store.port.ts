import type { StaffRole } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";

export type StaffStoreError = AppError<"ADMIN_STAFF_PROVIDER_FAILURE">;
export type StaffSource = "env" | "console" | "migration";

export interface StaffRecord {
  userId: string;
  role: StaffRole;
  source: StaffSource;
}

export interface StaffManagerRecord {
  userId: string;
  source: StaffSource;
  manageDenied?: boolean;
}

export interface EndedImpersonation {
  sessionId: string;
  userId: string;
  impersonatedBy: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IStaffStore {
  findActive(userId: string): Promise<Result<Option<StaffRecord>, StaffStoreError>>;
  lockActiveManagers(): Promise<Result<StaffManagerRecord[], StaffStoreError>>;
  revoke(userId: string): Promise<Result<EndedImpersonation[], StaffStoreError>>;
}
