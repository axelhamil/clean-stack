import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  ApprovalStoreError,
  IApprovalStore,
} from "../../application/ports/repositories/approval-store.port";
import type { ICountDueApprovalsQuery } from "../../application/queries/count-due-approvals.query";

export class DueApprovalCountQuery implements ICountDueApprovalsQuery {
  constructor(
    private readonly store: IApprovalStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(): Promise<Result<number, ApprovalStoreError>> {
    return this.instrumentation.startSpan({ name: "DueApprovalCountQuery > execute" }, () =>
      this.store.countDue(),
    );
  }
}
