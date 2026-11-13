import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  AdminUserListRow,
  IAdminUserStore,
  ListUsersQuery,
} from "../../application/ports/repositories/admin-user-store.port";
import type {
  AdminPage,
  AdminQueryError,
  IListUsersQuery,
} from "../../application/queries/list-users.query";
import { adminPageOf } from "./admin-page";

export class AdminUserListQuery implements IListUsersQuery {
  constructor(
    private readonly users: IAdminUserStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(input: ListUsersQuery): Promise<Result<AdminPage<AdminUserListRow>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminUserListQuery > execute" }, async () => {
      const rows = await this.users.listUsers(input);
      if (rows.isFailure) return Result.fail(rows.getError());

      return Result.ok(adminPageOf(rows.getValue(), input.limit));
    });
  }
}
