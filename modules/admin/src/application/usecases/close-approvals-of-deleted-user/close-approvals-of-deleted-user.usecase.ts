import { EventCollector, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { pendingRequestsOf } from "../../mappers/approval-request.mapper";
import type { IApprovalStore } from "../../ports/repositories/approval-store.port";
import type {
  CloseApprovalsOfDeletedUserError,
  CloseApprovalsOfDeletedUserInput,
} from "./close-approvals-of-deleted-user.dto";

export class CloseApprovalsOfDeletedUserUseCase
  implements IUseCase<CloseApprovalsOfDeletedUserInput, void, CloseApprovalsOfDeletedUserError>
{
  constructor(
    private readonly store: IApprovalStore,
    private readonly uow: IUnitOfWork,
  ) {}

  execute({
    userId,
  }: CloseApprovalsOfDeletedUserInput): Promise<Result<void, CloseApprovalsOfDeletedUserError>> {
    return this.uow.run(async (): Promise<Result<void, CloseApprovalsOfDeletedUserError>> => {
      const closed = await this.store.closeForDeletedUser(userId);
      if (closed.isFailure) return Result.fail(closed.getError());

      const requests = pendingRequestsOf(closed.getValue());
      if (requests.isFailure) return Result.fail(requests.getError());

      const now = new Date();
      const cancelled = requests.getValue();
      const settled = Result.combine(cancelled.map((request) => request.cancel(null, now)));
      if (settled.isFailure) return Result.fail(settled.getError());

      EventCollector.collectFrom(cancelled);

      return Result.ok();
    });
  }
}
