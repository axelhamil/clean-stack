import type { Option, Result } from "@packages/ddd-kit";
import type { TimeIdCursor } from "@packages/http/time-id-cursor";
import type { AdminStoreError } from "./admin-user-store.port";

export interface ListOrgsQuery {
  search?: string | undefined;
  cursor?: TimeIdCursor | undefined;
  limit: number;
}

export type AdminOrgListRow = AdminOrgRow & { cursorAt: string };

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: Date;
  ssoEnforced: boolean;
}

export interface AdminOrgMemberRow {
  userId: string;
  email: string;
  role: string;
}

export interface IAdminOrgStore {
  listOrgs(input: ListOrgsQuery): Promise<Result<AdminOrgListRow[], AdminStoreError>>;
  findOrgById(id: string): Promise<Result<Option<AdminOrgRow>, AdminStoreError>>;
  listMembersOf(organizationId: string): Promise<Result<AdminOrgMemberRow[], AdminStoreError>>;
}
