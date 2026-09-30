import { Option, Result } from "@packages/ddd-kit";
import { authSchema, db, eq, type SQL } from "@packages/drizzle";
import { isLocale, type Locale } from "@packages/i18n";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IProfileStore, ProfileError } from "../../../../shared/ports/profile.port";
import type { ITransaction } from "../../../../shared/transaction";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("PROFILE_PROVIDER_FAILURE");

export class DrizzleProfileStore implements IProfileStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findLocale(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<Locale>, ProfileError>> {
    return this.findLocaleWhere("findLocale", eq(authSchema.user.id, userId), tx);
  }

  async findLocaleByEmail(
    email: string,
    tx?: ITransaction,
  ): Promise<Result<Option<Locale>, ProfileError>> {
    return this.findLocaleWhere("findLocaleByEmail", eq(authSchema.user.email, email), tx);
  }

  async setLocale(
    userId: string,
    locale: Locale,
    tx?: ITransaction,
  ): Promise<Result<void, ProfileError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleProfileStore > setLocale" }, async () => {
      try {
        const query = invoker
          .update(authSchema.user)
          .set({ locale })
          .where(eq(authSchema.user.id, userId));

        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(storeFailure(err, "setLocale"));
      }
    });
  }

  private async findLocaleWhere(
    op: "findLocale" | "findLocaleByEmail",
    condition: SQL,
    tx?: ITransaction,
  ): Promise<Result<Option<Locale>, ProfileError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan({ name: `DrizzleProfileStore > ${op}` }, async () => {
      try {
        const query = invoker
          .select({ locale: authSchema.user.locale })
          .from(authSchema.user)
          .where(condition)
          .limit(1);

        const [row] = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        if (!row) return Result.fail({ code: "PROFILE_NOT_FOUND", message: "user not found" });
        return Result.ok(isLocale(row.locale) ? Option.some(row.locale) : Option.none());
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(storeFailure(err, op));
      }
    });
  }
}
