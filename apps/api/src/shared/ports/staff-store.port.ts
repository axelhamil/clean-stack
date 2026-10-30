import type { StaffPermission, StaffRole } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";

export type StaffStoreError = AppError<"ADMIN_STAFF_PROVIDER_FAILURE">;
export type StaffSource = "env" | "console" | "migration";

export interface StaffOverrideRecord {
  permission: StaffPermission;
  effect: "grant" | "deny";
  expiresAt: Option<Date>;
}

export interface StaffRecord {
  userId: string;
  role: StaffRole;
  source: StaffSource;
  overrides: StaffOverrideRecord[];
}

export interface StaffManagerRecord {
  userId: string;
  source: StaffSource;
}

export interface StaffListRow {
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  source: StaffSource;
  createdAt: Date;
}

export interface IStaffStore {
  findActive(userId: string): Promise<Result<Option<StaffRecord>, StaffStoreError>>;
  listActive(): Promise<Result<StaffListRow[], StaffStoreError>>;
  lockActiveManagers(): Promise<Result<StaffManagerRecord[], StaffStoreError>>;
  bootstrapFromEnv(userId: string): Promise<Result<boolean, StaffStoreError>>;
  assign(input: {
    userId: string;
    role: StaffRole;
    createdBy: string;
  }): Promise<Result<void, StaffStoreError>>;
  revoke(userId: string): Promise<Result<void, StaffStoreError>>;
}
