import type { AppError, Result } from "@packages/ddd-kit";

export type SweepOutcome = "ok" | "truncated" | "batch-error" | "failed";

export type SweepRun = {
  label: string;
  startedAt: Date;
  finishedAt: Date;
  outcome: SweepOutcome;
  durationMs: number;
  count: number;
};

export type SweepRunStoreError = AppError<"ADMIN_OPS_PROVIDER_FAILURE">;

export interface ISweepRunStore {
  record(run: SweepRun): Promise<Result<void, SweepRunStoreError>>;
  list(): Promise<Result<SweepRun[], SweepRunStoreError>>;
}
