import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { TimeIdCursor } from "@packages/http/time-id-cursor";
import type { EndedSessions } from "./staff-store.port";

export type AdminStoreError = AppError<"ADMIN_QUERY_PROVIDER_FAILURE">;

export interface ListUsersQuery {
  search?: string | undefined;
  banned?: boolean | undefined;
  organizationId?: string | undefined;
  cursor?: TimeIdCursor | undefined;
  limit: number;
}

export type AdminUserListRow = AdminUserRow & { cursorAt: string };

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  banned: boolean;
  banReason: Option<string>;
  banExpires: Option<Date>;
  twoFactorEnabled: boolean;
  createdAt: Date;
}

export interface AdminSessionRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: Option<string>;
  userAgent: Option<string>;
  impersonatedBy: Option<string>;
}

export interface AdminMembershipRow {
  organizationId: string;
  organizationName: string;
  role: string;
}

export type UnbanOutcome = "unbanned" | "not_banned" | "not_found";

export interface BanWrite {
  userId: string;
  reason: string;
  expiresAt: Option<Date>;
}

export interface IAdminUserStore {
  listUsers(input: ListUsersQuery): Promise<Result<AdminUserListRow[], AdminStoreError>>;
  findUserById(id: string): Promise<Result<Option<AdminUserRow>, AdminStoreError>>;
  listSessionsFor(userId: string): Promise<Result<AdminSessionRow[], AdminStoreError>>;
  listMembershipsFor(userId: string): Promise<Result<AdminMembershipRow[], AdminStoreError>>;
  ban(input: BanWrite): Promise<Result<Option<EndedSessions>, AdminStoreError>>;
  unban(userId: string): Promise<Result<UnbanOutcome, AdminStoreError>>;
  deleteSessions(userId: string): Promise<Result<EndedSessions, AdminStoreError>>;
}
