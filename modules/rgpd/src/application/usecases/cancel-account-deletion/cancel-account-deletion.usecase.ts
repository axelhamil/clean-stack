import { type ILogger, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { userDeletionCancelledEvent } from "../../events/user-deletion-cancelled.event";
import type {
  IDeletionStateRepository,
  RgpdError,
} from "../../ports/repositories/deletion-state.port";
import type {
  CancelAccountDeletionInput,
  CancelAccountDeletionOutput,
} from "./cancel-account-deletion.dto";

export class CancelAccountDeletionUseCase
  implements IUseCase<CancelAccountDeletionInput, CancelAccountDeletionOutput, RgpdError>
{
  constructor(
    private readonly states: IDeletionStateRepository,
    private readonly email: IEmailService,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: CancelAccountDeletionInput,
  ): Promise<Result<CancelAccountDeletionOutput, RgpdError>> {
    const found = await this.states.findByUser(input.userId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = found.getValue().unwrap();
    if (state.deletion.isWiped())
      return Result.fail({
        code: "ACCOUNT_DELETION_NOT_FOUND",
        message: "account has already been wiped",
      });

    const pending = state.deletion.pendingUntil();
    if (pending.isNone())
      return Result.fail({
        code: "ACCOUNT_DELETION_NOT_FOUND",
        message: "no pending deletion to cancel",
      });

    const cleared = await this.transactions.run(async () => {
      const done = await this.states.clearPending(input.userId);
      if (done.isFailure) return done;

      await emitBuiltEvent(this.outbox, userDeletionCancelledEvent({ userId: input.userId }));

      return Result.ok<RgpdError>();
    });
    if (cleared.isFailure) return Result.fail(cleared.getError());

    const sent = await this.email.sendTemplate(
      "delete_cancelled",
      state.email,
      { name: state.name },
      {
        idempotencyKey: `delete-cancelled/${input.userId}/${pending.unwrap().getTime()}`,
        locale: state.locale.toUndefined(),
      },
    );
    if (sent.isFailure)
      this.logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "deletion cleared but notification email failed",
      );

    return Result.ok({ ok: true });
  }
}
