import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type { ISweepRunStore, SweepRunStoreError } from "@packages/http/sweep-run.port";
import type {
  IListSweepRunsQuery,
  SweepRunState,
} from "../../application/queries/list-sweep-runs.query";
import { isSweepLate } from "../../application/services/sweep-cadence";

export async function sweepRunStatesOf(
  sweepRuns: ISweepRunStore,
): Promise<Result<SweepRunState[], SweepRunStoreError>> {
  const runs = await sweepRuns.list();
  if (runs.isFailure) return Result.fail(runs.getError());

  const now = new Date();

  return Result.ok(runs.getValue().map((run) => ({ ...run, late: isSweepLate(run, now) })));
}

export class SweepRunsQuery implements IListSweepRunsQuery {
  constructor(
    private readonly sweepRuns: ISweepRunStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(): Promise<Result<SweepRunState[], SweepRunStoreError>> {
    return this.instrumentation.startSpan({ name: "SweepRunsQuery > execute" }, () =>
      sweepRunStatesOf(this.sweepRuns),
    );
  }
}
