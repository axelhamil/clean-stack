import { Option, Result } from "@packages/ddd-kit";
import { authSchema, eq, resolveExecutor, staffSchema } from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IStepUpStore, StepUpStoreError } from "../../application/ports/step-up-store.port";

const fail = createDbFailure("ADMIN_STEP_UP_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DrizzleStepUpStore implements IStepUpStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findVerifiedAt(sessionId: string): Promise<Result<Option<Date>, StepUpStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStepUpStore > findVerifiedAt" },
      async () => {
        try {
          const { adminStepUp } = staffSchema;
          const query = exec
            .select({ verifiedAt: adminStepUp.verifiedAt })
            .from(adminStepUp)
            .where(eq(adminStepUp.sessionId, sessionId))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row?.verifiedAt));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "step-up lookup failed");
        }
      },
    );
  }

  async record(sessionId: string, verifiedAt: Date): Promise<Result<boolean, StepUpStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStepUpStore > record" }, async () => {
      try {
        const { session } = authSchema;
        const { adminStepUp } = staffSchema;
        const [live] = await exec
          .select({ id: session.id })
          .from(session)
          .where(eq(session.id, sessionId))
          .for("key share");
        if (!live) return Result.ok(false);

        await exec
          .insert(adminStepUp)
          .values({ sessionId, verifiedAt })
          .onConflictDoUpdate({ target: adminStepUp.sessionId, set: { verifiedAt } });

        return Result.ok(true);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "step-up record failed");
      }
    });
  }
}
