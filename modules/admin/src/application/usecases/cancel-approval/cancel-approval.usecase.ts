import { EventCollector, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import {
  APPROVAL_ALREADY_DECIDED,
  APPROVAL_NOT_FOUND,
} from "../../../domain/approval/approval-request.aggregate";
import { approvalRequestOf } from "../../mappers/approval-request.mapper";
import type { IApprovalStore } from "../../ports/repositories/approval-store.port";
import type { CancelApprovalError, CancelApprovalInput } from "./cancel-approval.dto";

export class CancelApprovalUseCase
  implements IUseCase<CancelApprovalInput, void, CancelApprovalError>
{
  constructor(
    private readonly store: IApprovalStore,
    private readonly uow: IUnitOfWork,
  ) {}

  async execute(input: CancelApprovalInput): Promise<Result<void, CancelApprovalError>> {
    const found = await this.store.find(input.approvalId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.fail(APPROVAL_NOT_FOUND);

    const reconstituted = approvalRequestOf(found.getValue().unwrap());
    if (reconstituted.isFailure) return Result.fail(reconstituted.getError());

    const request = reconstituted.getValue();
    const cancelled = request.cancel(input.userId, new Date());
    if (cancelled.isFailure) return Result.fail(cancelled.getError());

    return this.uow.run(async (): Promise<Result<void, CancelApprovalError>> => {
      const stored = await this.store.cancel(request.id.value, input.userId);
      if (stored.isFailure) return Result.fail(stored.getError());
      if (stored.getValue().isNone()) return Result.fail(APPROVAL_ALREADY_DECIDED);

      EventCollector.collectFrom(request);

      return Result.ok();
    });
  }
}
