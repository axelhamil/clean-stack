import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { authSchema, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import type { Locale } from "@packages/i18n";
import type {
  IProfileRepository,
  ProfileError,
} from "../../../application/ports/repositories/profile.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("PROFILE_PROVIDER_FAILURE");

export class DrizzleProfileRepository implements IProfileRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async setLocale(userId: string, locale: Locale): Promise<Result<void, ProfileError>> {
    const invoker = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleProfileRepository > setLocale" },
      async () => {
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
          return Result.fail(repositoryFailure("setLocale"));
        }
      },
    );
  }
}
