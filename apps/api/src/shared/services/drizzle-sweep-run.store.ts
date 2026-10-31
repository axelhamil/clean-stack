import { Result } from "@packages/ddd-kit";
import { asc, resolveExecutor, sweepSchema } from "@packages/drizzle";
import { dbOperationFailure } from "../db-failure";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { ISweepRunStore, SweepRun, SweepRunStoreError } from "../ports/sweep-run.port";

const { sweepRun } = sweepSchema;
const failure = dbOperationFailure("ADMIN_OPS_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DrizzleSweepRunStore implements ISweepRunStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async record(run: SweepRun): Promise<Result<void, SweepRunStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleSweepRunStore > record" }, async () => {
      try {
        const { label, ...result } = run;
        const query = exec
          .insert(sweepRun)
          .values(run)
          .onConflictDoUpdate({ target: sweepRun.label, set: result });
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("record sweep run"));
      }
    });
  }

  async list(): Promise<Result<SweepRun[], SweepRunStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleSweepRunStore > list" }, async () => {
      try {
        const query = exec.select().from(sweepRun).orderBy(asc(sweepRun.label));
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(rows);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("list sweep runs"));
      }
    });
  }
}
