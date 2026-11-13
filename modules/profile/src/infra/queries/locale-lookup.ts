import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { authSchema, dbOperationFailure, resolveExecutor, type SQL } from "@packages/drizzle";
import { isLocale, type Locale } from "@packages/i18n";
import type { ProfileError } from "../../application/ports/repositories/profile.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("PROFILE_PROVIDER_FAILURE");

export interface LocaleLookup {
  spanName: string;
  op: "findLocale" | "findLocaleByEmail";
  condition: SQL;
}

export function lookupLocale(
  instrumentation: IInstrumentation,
  { spanName, op, condition }: LocaleLookup,
): Promise<Result<Option<Locale>, ProfileError>> {
  const invoker = resolveExecutor();
  return instrumentation.startSpan({ name: spanName }, async () => {
    try {
      const query = invoker
        .select({ locale: authSchema.user.locale })
        .from(authSchema.user)
        .where(condition)
        .limit(1);

      const [row] = await instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );

      if (!row) return Result.fail({ code: "PROFILE_NOT_FOUND", message: "user not found" });
      return Result.ok(isLocale(row.locale) ? Option.some(row.locale) : Option.none());
    } catch (err) {
      instrumentation.capture(err);
      return Result.fail(queryFailure(op));
    }
  });
}
