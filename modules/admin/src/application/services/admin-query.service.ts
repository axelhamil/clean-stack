import type { Result } from "@packages/ddd-kit";
import type { AdminOrgListRow, ListOrgsQuery } from "../ports/repositories/admin-org-store.port";
import type { AdminUserListRow, ListUsersQuery } from "../ports/repositories/admin-user-store.port";
import type { IListOrgsQuery } from "../queries/list-orgs.query";
import type { AdminPage, AdminQueryError, IListUsersQuery } from "../queries/list-users.query";

export class AdminQueryService {
  constructor(
    private readonly users: IListUsersQuery,
    private readonly orgs: IListOrgsQuery,
  ) {}

  listUsers(input: ListUsersQuery): Promise<Result<AdminPage<AdminUserListRow>, AdminQueryError>> {
    return this.users.execute(input);
  }

  listOrgs(input: ListOrgsQuery): Promise<Result<AdminPage<AdminOrgListRow>, AdminQueryError>> {
    return this.orgs.execute(input);
  }
}
