import type { StaffPermission } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import type { ISweepRunStore, SweepRun, SweepRunStoreError } from "@packages/http/sweep-run.port";
import type {
  ApprovalStoreError,
  IApprovalStore,
  OpenApprovals,
} from "../ports/approval-store.port";
import type { IOpsStore, OpsStoreError } from "../ports/ops-store.port";
import type { SweepRunState } from "./ops.service";
import { isSweepLate } from "./sweep-cadence";

export const INBOX_APPROVALS_PAGE = 20;

export interface InboxQueues {
  deadEvents: number;
  deadEmails: number;
  deadWebhooks: number;
}

export interface Inbox {
  approvals: Option<Result<OpenApprovals, ApprovalStoreError>>;
  queues: Option<Result<InboxQueues, OpsStoreError>>;
  sweeps: Option<Result<SweepRunState[], SweepRunStoreError>>;
}

function needsAttention(run: SweepRunState): boolean {
  return run.late || run.outcome === "failed" || run.outcome === "batch-error";
}

export class InboxService {
  constructor(
    private readonly approvals: IApprovalStore,
    private readonly ops: IOpsStore,
    private readonly sweepRuns: ISweepRunStore,
  ) {}

  async forStaff(permissions: readonly StaffPermission[]): Promise<Inbox> {
    const readsOps = permissions.includes("ops.read");
    const [approvals, queues, sweeps] = await Promise.all([
      permissions.includes("approvals.decide")
        ? this.approvals.listOpen(INBOX_APPROVALS_PAGE).then(Option.some)
        : Option.none<Result<OpenApprovals, ApprovalStoreError>>(),
      readsOps
        ? this.deadQueues().then(Option.some)
        : Option.none<Result<InboxQueues, OpsStoreError>>(),
      readsOps
        ? this.attentionSweeps().then(Option.some)
        : Option.none<Result<SweepRunState[], SweepRunStoreError>>(),
    ]);

    return { approvals, queues, sweeps };
  }

  private async deadQueues(): Promise<Result<InboxQueues, OpsStoreError>> {
    const [deadEvents, queues] = await Promise.all([
      this.ops.countDeadOutbox(),
      this.ops.countDeadQueues(),
    ]);
    if (deadEvents.isFailure) return Result.fail(deadEvents.getError());
    if (queues.isFailure) return Result.fail(queues.getError());

    const { emails, webhooks } = queues.getValue();

    return Result.ok({
      deadEvents: deadEvents.getValue(),
      deadEmails: emails,
      deadWebhooks: webhooks,
    });
  }

  private async attentionSweeps(): Promise<Result<SweepRunState[], SweepRunStoreError>> {
    const runs = await this.sweepRuns.list();
    if (runs.isFailure) return Result.fail(runs.getError());

    const now = new Date();
    const states = runs.getValue().map((run: SweepRun) => ({
      ...run,
      late: isSweepLate(run, now),
    }));

    return Result.ok(states.filter(needsAttention));
  }
}
