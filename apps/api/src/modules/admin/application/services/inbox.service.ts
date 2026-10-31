import type { StaffPermission } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import type {
  ISweepRunStore,
  SweepRun,
  SweepRunStoreError,
} from "../../../../shared/ports/sweep-run.port";
import type {
  ApprovalStoreError,
  IApprovalStore,
  OpenApprovals,
} from "../ports/approval-store.port";
import type { IOpsStore, OpsStoreError } from "../ports/ops-store.port";

export const INBOX_APPROVALS_PAGE = 20;

export interface InboxOperations {
  deadEvents: number;
  deadEmails: number;
  deadWebhooks: number;
  failedSweeps: SweepRun[];
}

export interface Inbox {
  approvals: Option<OpenApprovals>;
  operations: Option<InboxOperations>;
}

export type InboxError = ApprovalStoreError | OpsStoreError | SweepRunStoreError;

function hasFailed(run: SweepRun): boolean {
  return run.outcome === "failed" || run.outcome === "batch-error";
}

export class InboxService {
  constructor(
    private readonly approvals: IApprovalStore,
    private readonly ops: IOpsStore,
    private readonly sweepRuns: ISweepRunStore,
  ) {}

  async forStaff(permissions: readonly StaffPermission[]): Promise<Result<Inbox, InboxError>> {
    const approvals = await this.openApprovals(permissions);
    if (approvals.isFailure) return Result.fail(approvals.getError());

    const operations = await this.operations(permissions);
    if (operations.isFailure) return Result.fail(operations.getError());

    return Result.ok({ approvals: approvals.getValue(), operations: operations.getValue() });
  }

  private async openApprovals(
    permissions: readonly StaffPermission[],
  ): Promise<Result<Option<OpenApprovals>, ApprovalStoreError>> {
    if (!permissions.includes("approvals.decide")) return Result.ok(Option.none());

    const open = await this.approvals.listOpen(INBOX_APPROVALS_PAGE);
    if (open.isFailure) return Result.fail(open.getError());

    return Result.ok(Option.some(open.getValue()));
  }

  private async operations(
    permissions: readonly StaffPermission[],
  ): Promise<Result<Option<InboxOperations>, OpsStoreError | SweepRunStoreError>> {
    if (!permissions.includes("ops.read")) return Result.ok(Option.none());

    const deadEvents = await this.ops.countDeadOutbox();
    if (deadEvents.isFailure) return Result.fail(deadEvents.getError());

    const queues = await this.ops.countDeadQueues();
    if (queues.isFailure) return Result.fail(queues.getError());

    const runs = await this.sweepRuns.list();
    if (runs.isFailure) return Result.fail(runs.getError());

    return Result.ok(
      Option.some({
        deadEvents: deadEvents.getValue(),
        deadEmails: queues.getValue().emails,
        deadWebhooks: queues.getValue().webhooks,
        failedSweeps: runs.getValue().filter(hasFailed),
      }),
    );
  }
}
