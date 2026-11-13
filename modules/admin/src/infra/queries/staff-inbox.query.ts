import type { StaffPermission } from "@packages/access-control";
import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type { ISweepRunStore, SweepRunStoreError } from "@packages/http/sweep-run.port";
import type {
  ApprovalStoreError,
  IApprovalStore,
  OpenApprovals,
} from "../../application/ports/repositories/approval-store.port";
import type { IOpsStore, OpsStoreError } from "../../application/ports/repositories/ops-store.port";
import type { SweepRunState } from "../../application/queries/list-sweep-runs.query";
import type {
  Inbox,
  InboxQueues,
  IStaffInboxQuery,
} from "../../application/queries/staff-inbox.query";
import { sweepRunStatesOf } from "./list-sweep-runs.query";

export const INBOX_APPROVALS_PAGE = 20;

function needsAttention(run: SweepRunState): boolean {
  return run.late || run.outcome === "failed" || run.outcome === "batch-error";
}

export class StaffInboxQuery implements IStaffInboxQuery {
  constructor(
    private readonly approvals: IApprovalStore,
    private readonly ops: IOpsStore,
    private readonly sweepRuns: ISweepRunStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute({
    permissions,
  }: {
    permissions: readonly StaffPermission[];
  }): Promise<Result<Inbox, never>> {
    return this.instrumentation.startSpan({ name: "StaffInboxQuery > execute" }, async () => {
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

      return Result.ok({ approvals, queues, sweeps });
    });
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
    const states = await sweepRunStatesOf(this.sweepRuns);
    if (states.isFailure) return states;

    return Result.ok(states.getValue().filter(needsAttention));
  }
}
