import { type IInstrumentation, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { consentLinkedEvent } from "../../events/consent-linked.event";
import type { ConsentError, IConsentRepository } from "../../ports/repositories/consent.port";
import type { ReconcileConsentInput } from "./reconcile-consent.dto";

export class ReconcileConsentUseCase
  implements IUseCase<ReconcileConsentInput, void, ConsentError>
{
  constructor(
    private readonly repository: IConsentRepository,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute(input: ReconcileConsentInput): Promise<Result<void, ConsentError>> {
    const { subjectId, userId } = input;

    try {
      return await this.uow.run(async () => {
        const linked = await this.repository.linkSubjectToUser(subjectId, userId);
        if (linked.isFailure) return Result.fail<void, ConsentError>(linked.getError());

        const consentRecordIds = linked.getValue();
        if (consentRecordIds.length === 0) return Result.ok<ConsentError>();

        await emitBuiltEvent(
          this.outbox,
          consentLinkedEvent({ userId, subjectId, consentRecordIds }),
        );

        return Result.ok<ConsentError>();
      });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "CONSENT_PROVIDER_FAILURE",
        message: "cookie consent reconcile failed",
      });
    }
  }
}
