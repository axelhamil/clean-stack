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

export interface IAdminUserStore {
  listUsers(input: ListUsersInput): Promise<AdminUserRow[]>;
}
