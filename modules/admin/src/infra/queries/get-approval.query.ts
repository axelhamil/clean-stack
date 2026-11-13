import type { IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type {
  ApprovalRecord,
  ApprovalStoreError,
  IApprovalStore,
} from "../../application/ports/repositories/approval-store.port";
import type { IGetApprovalQuery } from "../../application/queries/get-approval.query";

export class ApprovalDetailQuery implements IGetApprovalQuery {
  constructor(
    private readonly store: IApprovalStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute({
    approvalId,
  }: {
    approvalId: string;
  }): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>> {
    return this.instrumentation.startSpan({ name: "ApprovalDetailQuery > execute" }, () =>
      this.store.find(approvalId),
    );
  }
}
