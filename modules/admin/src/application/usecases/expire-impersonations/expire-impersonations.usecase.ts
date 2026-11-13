import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { IStaffStore, StaffStoreError } from "../../ports/repositories/staff-store.port";
import { announceImpersonationsEnded } from "../../services/impersonation-end";
import { announceSessionsEnded } from "../../services/session-end";
import type { ExpireImpersonationsInput } from "./expire-impersonations.dto";

export class ExpireImpersonationsUseCase
  implements IUseCase<ExpireImpersonationsInput, number, StaffStoreError>
{
  constructor(
    private readonly store: IStaffStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute({ batchSize }: ExpireImpersonationsInput): Promise<Result<number, StaffStoreError>> {
    return this.uow.run(async (): Promise<Result<number, StaffStoreError>> => {
      const ended = await this.store.endExpiredImpersonations(batchSize);
      if (ended.isFailure) return Result.fail(ended.getError());

      await announceImpersonationsEnded(this.outbox, ended.getValue(), "expired", new Date());
      await announceSessionsEnded(this.outbox, ended.getValue(), null);

      return Result.ok(ended.getValue().length);
    });
  }
}
