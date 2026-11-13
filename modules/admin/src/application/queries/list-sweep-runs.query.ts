import type { IQuery } from "@packages/ddd-kit";
import type { SweepRun, SweepRunStoreError } from "@packages/http/sweep-run.port";

export type SweepRunState = SweepRun & { late: boolean };

export type IListSweepRunsQuery = IQuery<void, SweepRunState[], SweepRunStoreError>;
