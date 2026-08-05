import type { ListOrgsInput } from "../dto/list-orgs.dto";

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: Date;
}

export interface AdminOrgMemberRow {
  userId: string;
  email: string;
  role: string;
}

export interface IAdminOrgStore {
  listOrgs(input: ListOrgsInput): Promise<AdminOrgRow[]>;
  findOrgById(id: string): Promise<AdminOrgRow | null>;
  listMembersOf(organizationId: string): Promise<AdminOrgMemberRow[]>;
  findPlanFor(organizationId: string): Promise<string | null>;
}
