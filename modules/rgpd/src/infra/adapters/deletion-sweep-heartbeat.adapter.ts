import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { sweepSpans } from "@packages/drizzle/sweep-span";
import { type SweepBeat, withSweepHeartbeat } from "@packages/http/sweep-heartbeat";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import type {
  DeletionSweepRun,
  IDeletionSweepHeartbeat,
} from "../../application/ports/services/deletion-sweep-heartbeat.port";

const SWEEP_LABEL = "rgpd-sweep";

function beatOfDeletions(run: DeletionSweepRun): SweepBeat | undefined {
  if (run.dryRun) return undefined;

  const count = run.succeeded.length;
  if (run.failed.length > 0) return { outcome: "batch-error", count };

  return { outcome: run.truncated ? "truncated" : "ok", count };
}

export class DeletionSweepHeartbeat implements IDeletionSweepHeartbeat {
  constructor(
    private readonly store: ISweepRunStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async around<T extends DeletionSweepRun, E>(
    dryRun: boolean | undefined,
    run: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>> {
    let failure: Option<E> = Option.none();

    try {
      const output = await withSweepHeartbeat(
        {
          label: SWEEP_LABEL,
          store: this.store,
          spans: sweepSpans(this.instrumentation),
          beatOf: beatOfDeletions,
          dryRun,
        },
        async () => {
          const result = await run();
          if (result.isFailure) {
            failure = Option.some(result.getError());
            throw new Error("rgpd sweep failed");
          }

          return result.getValue();
        },
      );

      return Result.ok(output);
    } catch (err) {
      if (failure.isSome()) return Result.fail(failure.unwrap());

      throw err;
    }
  }
}
