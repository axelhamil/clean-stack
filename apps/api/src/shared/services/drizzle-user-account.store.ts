import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { authSchema, eq, resolveExecutor } from "@packages/drizzle";
import { dbOperationFailure } from "../db-failure";
import type { IUserAccountStore, UserAccountError, UserContact } from "../ports/user-account.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const failure = dbOperationFailure("USER_ACCOUNT_PROVIDER_FAILURE");

export class DrizzleUserAccountStore implements IUserAccountStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findContact(userId: string): Promise<Result<Option<UserContact>, UserAccountError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleUserAccountStore > findContact" },
      async () => {
        try {
          const { user } = authSchema;
          const query = exec
            .select({ email: user.email, name: user.name, locale: user.locale })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            Option.fromNullable(row).map((found) => ({
              email: found.email,
              name: Option.fromNullable(found.name),
              locale: Option.fromNullable(found.locale),
            })),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("findContact"));
        }
      },
    );
  }

  async setName(userId: string, name: string): Promise<Result<void, UserAccountError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleUserAccountStore > setName" },
      async () => {
        try {
          const { user } = authSchema;
          const query = exec.update(user).set({ name }).where(eq(user.id, userId));

          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("setName"));
        }
      },
    );
  }
}
