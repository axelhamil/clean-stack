import { Option, Result } from "@packages/ddd-kit";
import { authSchema, db, eq } from "@packages/drizzle";
import { isLocale, type Locale } from "@packages/i18n";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type { IProfileStore, ProfileError } from "../../application/ports/profile.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

function storeFailure(err: unknown, op: string): ProfileError {
  return {
    code: "PROFILE_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

export class DrizzleProfileStore implements IProfileStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findLocale(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<Locale>, ProfileError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleProfileStore > findLocale" },
      async () => {
        try {
          const query = invoker
            .select({ locale: authSchema.user.locale })
            .from(authSchema.user)
            .where(eq(authSchema.user.id, userId))
            .limit(1);

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const row = rows[0];
          if (!row) return Result.fail({ code: "PROFILE_NOT_FOUND", message: "user not found" });
          return Result.ok(isLocale(row.locale) ? Option.some(row.locale) : Option.none());
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findLocale"));
        }
      },
    );
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
}
