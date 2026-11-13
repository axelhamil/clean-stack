import type { Result } from "@packages/ddd-kit";

export interface DeletionSweepRun {
  succeeded: string[];
  failed: Array<{ userId: string; errorCode: string }>;
  dryRun: boolean;
  truncated: boolean;
}

export interface IDeletionSweepHeartbeat {
  around<T extends DeletionSweepRun, E>(
    dryRun: boolean | undefined,
    run: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>>;
}
