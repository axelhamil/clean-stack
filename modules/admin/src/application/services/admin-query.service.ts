import type { Option, Result } from "@packages/ddd-kit";
import type { AdminOrgListRow, ListOrgsQuery } from "../ports/repositories/admin-org-store.port";
import type { AdminUserListRow, ListUsersQuery } from "../ports/repositories/admin-user-store.port";
import type { AdminOrgDetail, IGetOrgQuery } from "../queries/get-org.query";
import type { AdminUserDetail, IGetUserQuery } from "../queries/get-user.query";
import type { IListOrgsQuery } from "../queries/list-orgs.query";
import type { AdminPage, AdminQueryError, IListUsersQuery } from "../queries/list-users.query";

export class AdminQueryService {
  constructor(
    private readonly users: IListUsersQuery,
    private readonly orgs: IListOrgsQuery,
    private readonly org: IGetOrgQuery,
    private readonly user: IGetUserQuery,
  ) {}

  listUsers(input: ListUsersQuery): Promise<Result<AdminPage<AdminUserListRow>, AdminQueryError>> {
    return this.users.execute(input);
  }

  listOrgs(input: ListOrgsQuery): Promise<Result<AdminPage<AdminOrgListRow>, AdminQueryError>> {
    return this.orgs.execute(input);
  }

  getOrg(id: string): Promise<Result<Option<AdminOrgDetail>, AdminQueryError>> {
    return this.org.execute({ organizationId: id });
  }

  getUser(id: string): Promise<Result<Option<AdminUserDetail>, AdminQueryError>> {
    return this.user.execute({ userId: id });
  }
}
