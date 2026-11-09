import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  billingSchema,
  dbNow,
  dbOperationFailure,
  eq,
  gt,
  isNull,
  resolveExecutor,
} from "@packages/drizzle";
import type {
  ActivePlanOverride,
  IPlanOverrideStore,
  NewPlanOverride,
  PlanOverrideStoreError,
} from "../../application/ports/plan-override.port";

const { planOverride } = billingSchema;
const failure = dbOperationFailure("PLAN_OVERRIDE_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

function activeOf(organizationId: string) {
  return and(
    eq(planOverride.organizationId, organizationId),
    isNull(planOverride.revokedAt),
    gt(planOverride.expiresAt, dbNow),
  );
}

export class DrizzlePlanOverrideStore implements IPlanOverrideStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findActive(
    organizationId: string,
  ): Promise<Result<Option<ActivePlanOverride>, PlanOverrideStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePlanOverrideStore > findActive" },
      async () => {
        try {
          const query = exec
            .select({
              id: planOverride.id,
              organizationId: planOverride.organizationId,
              tier: planOverride.tier,
              expiresAt: planOverride.expiresAt,
              note: planOverride.note,
              createdAt: planOverride.createdAt,
            })
            .from(planOverride)
            .where(activeOf(organizationId))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("find active plan override"));
        }
      },
    );
  }

  async closeOpen(organizationId: string): Promise<Result<Option<string>, PlanOverrideStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePlanOverrideStore > closeOpen" },
      async () => {
        try {
          const query = exec
            .update(planOverride)
            .set({ revokedAt: dbNow })
            .where(
              and(eq(planOverride.organizationId, organizationId), isNull(planOverride.revokedAt)),
            )
            .returning({ id: planOverride.id });
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row?.id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("close open plan override"));
        }
      },
    );
  }

  async insert(row: NewPlanOverride): Promise<Result<boolean, PlanOverrideStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePlanOverrideStore > insert" },
      async () => {
        try {
          const query = exec
            .insert(planOverride)
            .values(row)
            .onConflictDoNothing({
              target: planOverride.organizationId,
              where: isNull(planOverride.revokedAt),
            })
            .returning({ id: planOverride.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("insert plan override"));
        }
      },
    );
  }

  async revokeActive(
    organizationId: string,
  ): Promise<Result<Option<{ id: string; tier: string }>, PlanOverrideStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzlePlanOverrideStore > revokeActive" },
      async () => {
        try {
          const query = exec
            .update(planOverride)
            .set({ revokedAt: dbNow })
            .where(activeOf(organizationId))
            .returning({ id: planOverride.id, tier: planOverride.tier });
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("revoke plan override"));
        }
      },
    );
  }
}
