import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  AdminOrgListRow,
  IAdminOrgStore,
  ListOrgsQuery,
} from "../../application/ports/repositories/admin-org-store.port";
import type { IListOrgsQuery } from "../../application/queries/list-orgs.query";
import type { AdminPage, AdminQueryError } from "../../application/queries/list-users.query";
import { adminPageOf } from "./admin-page";

export class AdminOrgListQuery implements IListOrgsQuery {
  constructor(
    private readonly orgs: IAdminOrgStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(input: ListOrgsQuery): Promise<Result<AdminPage<AdminOrgListRow>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminOrgListQuery > execute" }, async () => {
      const rows = await this.orgs.listOrgs(input);
      if (rows.isFailure) return Result.fail(rows.getError());

      return Result.ok(adminPageOf(rows.getValue(), input.limit));
    });
  }
}
