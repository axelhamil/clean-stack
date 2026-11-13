import type { StaffPermission, StaffRole } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";
import type {
  StaffGrant,
  StaffOverrideGrant,
  StaffSource,
} from "../../../domain/staff/services/staff-access.service";

export type StaffStoreError = AppError<"ADMIN_STAFF_PROVIDER_FAILURE">;
export type { StaffSource };

export type StaffOverrideRecord = StaffOverrideGrant;

export interface StaffOverrideRow extends StaffOverrideRecord {
  id: string;
  createdAt: Date;
}

export interface StaffRecord extends StaffGrant {
  banned: boolean;
}

export interface StaffManagerRecord {
  userId: string;
  source: StaffSource;
  manageDenied?: boolean;
}

export interface StaffListRow {
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  source: StaffSource;
  createdAt: Date;
}

export interface EndedSession {
  sessionId: string;
  userId: string;
}

export interface EndedImpersonation extends EndedSession {
  impersonatedBy: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface EndedSessions {
  sessions: EndedSession[];
  impersonations: EndedImpersonation[];
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
  revoke(userId: string): Promise<Result<EndedImpersonation[], StaffStoreError>>;
  endImpersonationsBy(userId: string): Promise<Result<EndedImpersonation[], StaffStoreError>>;
  endExpiredImpersonations(limit: number): Promise<Result<EndedImpersonation[], StaffStoreError>>;
  endSession(sessionId: string): Promise<Result<EndedSessions, StaffStoreError>>;
  countExpiredImpersonations(): Promise<Result<number, StaffStoreError>>;
  listLiveOverrides(userId: string): Promise<Result<StaffOverrideRow[], StaffStoreError>>;
  replaceOverride(input: {
    userId: string;
    permission: StaffPermission;
    effect: "grant" | "deny";
    expiresAt: Option<Date>;
    createdBy: string;
  }): Promise<Result<string, StaffStoreError>>;
  revokeOverride(
    userId: string,
    overrideId: string,
  ): Promise<Result<Option<StaffOverrideRecord>, StaffStoreError>>;
}
