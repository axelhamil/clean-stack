import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type { IAdminUserStore } from "../../application/ports/repositories/admin-user-store.port";
import type { AdminUserDetail, IGetUserQuery } from "../../application/queries/get-user.query";
import type { AdminQueryError } from "../../application/queries/list-users.query";

export class AdminUserDetailQuery implements IGetUserQuery {
  constructor(
    private readonly users: IAdminUserStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute({
    userId,
  }: {
    userId: string;
  }): Promise<Result<Option<AdminUserDetail>, AdminQueryError>> {
    return this.instrumentation.startSpan({ name: "AdminUserDetailQuery > execute" }, async () => {
      const found = await this.users.findUserById(userId);
      if (found.isFailure) return Result.fail(found.getError());

      const maybeUser = found.getValue();
      if (maybeUser.isNone()) return Result.ok(Option.none<AdminUserDetail>());

      const [sessions, memberships] = await Promise.all([
        this.users.listSessionsFor(userId),
        this.users.listMembershipsFor(userId),
      ]);
      if (sessions.isFailure) return Result.fail(sessions.getError());
      if (memberships.isFailure) return Result.fail(memberships.getError());

      return Result.ok(
        Option.some({
          ...maybeUser.unwrap(),
          sessions: sessions.getValue(),
          memberships: memberships.getValue(),
        }),
      );
    });
  }
}
