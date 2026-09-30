import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ListUsersInput } from "../dto/list-users.dto";

export type AdminStoreError = AppError<"ADMIN_QUERY_PROVIDER_FAILURE">;

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Option<string>;
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

export interface IAdminUserStore {
  listUsers(input: ListUsersInput): Promise<Result<AdminUserRow[], AdminStoreError>>;
  findUserById(id: string): Promise<Result<Option<AdminUserRow>, AdminStoreError>>;
  listSessionsFor(userId: string): Promise<Result<AdminSessionRow[], AdminStoreError>>;
  listMembershipsFor(userId: string): Promise<Result<AdminMembershipRow[], AdminStoreError>>;
}
