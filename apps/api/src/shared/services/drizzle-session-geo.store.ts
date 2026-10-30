import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  not,
  resolveExecutor,
  schema,
} from "@packages/drizzle";
import { dbOperationFailure } from "../db-failure";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { ISessionGeoStore, PreviousSession, SessionGeoError } from "../ports/session-geo.port";

const failure = dbOperationFailure("SESSION_GEO_PROVIDER_FAILURE");

export class DrizzleSessionGeoStore implements ISessionGeoStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findPreviousSession(
    userId: string,
    excludedSessionId: string,
    since: Date,
  ): Promise<Result<Option<PreviousSession>, SessionGeoError>> {
    const exec = resolveExecutor();
    const { session } = schema;

    return this.instrumentation.startSpan(
      { name: "DrizzleSessionGeoStore > findPreviousSession" },
      async () => {
        try {
          const query = exec
            .select({ id: session.id, country: session.country, createdAt: session.createdAt })
            .from(session)
            .where(
              and(
                eq(session.userId, userId),
                not(eq(session.id, excludedSessionId)),
                isNull(session.impersonatedBy),
                isNotNull(session.country),
                gte(session.createdAt, since),
              ),
            )
            .orderBy(desc(session.createdAt))
            .limit(1);

          const [row] = await this.instrumentation.startSpan(
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );

          return Result.ok(
            Option.fromNullable(row).map((found) => ({
              id: found.id,
              country: Option.fromNullable(found.country),
              createdAt: found.createdAt,
            })),
          );
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail(failure("find previous session"));
        }
      },
    );
  }
}
