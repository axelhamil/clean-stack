import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { encodeTimeIdCursor } from "@packages/http/time-id-cursor";
import type {
  ApprovalRecord,
  ApprovalStoreError,
  IApprovalStore,
  ListApprovalsQuery,
} from "../../application/ports/repositories/approval-store.port";
import type {
  ApprovalPage,
  IListApprovalsQuery,
} from "../../application/queries/list-approvals.query";

function approvalCursorOf(record: ApprovalRecord): string {
  return encodeTimeIdCursor(record.createdAt.toISOString(), record.id);
}

export class ApprovalListQuery implements IListApprovalsQuery {
  constructor(
    private readonly store: IApprovalStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(input: ListApprovalsQuery): Promise<Result<ApprovalPage, ApprovalStoreError>> {
    return this.instrumentation.startSpan({ name: "ApprovalListQuery > execute" }, async () => {
      const found = await this.store.list(input);
      if (found.isFailure) return Result.fail(found.getError());

      const items = found.getValue();
      const last = Option.fromNullable(items.at(-1));
      const isFull = items.length === input.limit;

      return Result.ok({
        items,
        nextCursor: last.filter(() => isFull).map(approvalCursorOf),
      });
    });
  }
}
