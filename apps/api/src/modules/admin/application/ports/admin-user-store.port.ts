import type { Option } from "@packages/ddd-kit";
import type { ListUsersInput } from "../dto/list-users.dto";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  twoFactorEnabled: boolean | null;
  createdAt: Date;
}

export interface AdminSessionRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
}

export interface AdminMembershipRow {
  organizationId: string;
  organizationName: string;
  role: string;
}

export interface IAdminUserStore {
  listUsers(input: ListUsersInput): Promise<AdminUserRow[]>;
  findUserById(id: string): Promise<Option<AdminUserRow>>;
  listSessionsFor(userId: string): Promise<AdminSessionRow[]>;
  listMembershipsFor(userId: string): Promise<AdminMembershipRow[]>;
}
