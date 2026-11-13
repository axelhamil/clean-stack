import { EventCollector, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { pendingRequestsOf } from "../../mappers/approval-request.mapper";
import type { IApprovalStore } from "../../ports/repositories/approval-store.port";
import type { ExpireApprovalsError, ExpireApprovalsInput } from "./expire-approvals.dto";

export class ExpireApprovalsUseCase
  implements IUseCase<ExpireApprovalsInput, number, ExpireApprovalsError>
{
  constructor(
    private readonly store: IApprovalStore,
    private readonly uow: IUnitOfWork,
  ) {}

  execute({ batchSize }: ExpireApprovalsInput): Promise<Result<number, ExpireApprovalsError>> {
    return this.uow.run(async (): Promise<Result<number, ExpireApprovalsError>> => {
      const due = await this.store.expireDue(batchSize);
      if (due.isFailure) return Result.fail(due.getError());

      const requests = pendingRequestsOf(due.getValue());
      if (requests.isFailure) return Result.fail(requests.getError());

      const now = new Date();
      const expired = requests.getValue();
      const settled = Result.combine(expired.map((request) => request.expire(now)));
      if (settled.isFailure) return Result.fail(settled.getError());

      EventCollector.collectFrom(expired);

      return Result.ok(expired.length);
    });
  }
}
