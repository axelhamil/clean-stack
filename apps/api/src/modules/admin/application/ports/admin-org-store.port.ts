import type { Option, Result } from "@packages/ddd-kit";
import type { ListOrgsInput } from "../dto/list-orgs.dto";
import type { AdminStoreError } from "./admin-user-store.port";

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
  listOrgs(input: ListOrgsInput): Promise<Result<AdminOrgRow[], AdminStoreError>>;
  findOrgById(id: string): Promise<Result<Option<AdminOrgRow>, AdminStoreError>>;
  listMembersOf(organizationId: string): Promise<Result<AdminOrgMemberRow[], AdminStoreError>>;
  findPlanFor(organizationId: string): Promise<Result<Option<string>, AdminStoreError>>;
}
