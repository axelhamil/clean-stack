import { type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { type BuiltEvent, emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  ConsentError,
  ConsentRecord,
  IConsentRepository,
} from "../ports/repositories/consent.port";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAfter(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export class ConsentLedger {
  constructor(
    private readonly repository: IConsentRepository,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async append<TPayload>(
    record: ConsentRecord,
    event: BuiltEvent<TPayload>,
    failureMessage: string,
  ): Promise<Result<void, ConsentError>> {
    try {
      return await this.uow.run(async () => {
        const inserted = await this.repository.insert(record);
        if (inserted.isFailure) return inserted;

        await emitBuiltEvent(this.outbox, event);

        return inserted;
      });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({ code: "CONSENT_PROVIDER_FAILURE", message: failureMessage });
    }
  }
}
