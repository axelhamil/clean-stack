import { Option, Result } from "@packages/ddd-kit";
import { authSchema, eq, resolveExecutor, type SQL } from "@packages/drizzle";
import { isLocale, type Locale } from "@packages/i18n";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IProfileStore, ProfileError } from "../../../../shared/ports/profile.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("PROFILE_PROVIDER_FAILURE");

export class DrizzleProfileStore implements IProfileStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findLocale(userId: string): Promise<Result<Option<Locale>, ProfileError>> {
    return this.findLocaleWhere("findLocale", eq(authSchema.user.id, userId));
  }

  async findLocaleByEmail(email: string): Promise<Result<Option<Locale>, ProfileError>> {
    return this.findLocaleWhere("findLocaleByEmail", eq(authSchema.user.email, email));
  }

  async setLocale(userId: string, locale: Locale): Promise<Result<void, ProfileError>> {
    const invoker = resolveExecutor();
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
        return Result.fail(storeFailure("setLocale"));
      }
    });
  }

  private async findLocaleWhere(
    op: "findLocale" | "findLocaleByEmail",
    condition: SQL,
  ): Promise<Result<Option<Locale>, ProfileError>> {
    const invoker = resolveExecutor();
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
        return Result.fail(storeFailure(op));
      }
    });
  }
}
