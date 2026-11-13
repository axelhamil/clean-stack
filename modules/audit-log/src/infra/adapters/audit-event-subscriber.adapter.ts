import { AppErrorException, type IInstrumentation, type IUseCase } from "@packages/ddd-kit";
import type { BuiltInEventHandler } from "@packages/outbox/event-handlers";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { recordAuditEntryOnEvent } from "../../application/event-handlers/record-audit-entry.handler";
import type { AuditError } from "../../application/ports/repositories/audit-log.port";
import type { RecordAuditEntryInput } from "../../application/usecases/record-audit-entry/record-audit-entry.dto";

export class AuditEventSubscriber implements BuiltInEventHandler {
  readonly name = "audit-log";
  private readonly react;

  constructor(
    recordAuditEntry: IUseCase<RecordAuditEntryInput, void, AuditError>,
    private readonly instrumentation: IInstrumentation,
  ) {
    this.react = recordAuditEntryOnEvent({ RecordAuditEntryUseCase: recordAuditEntry });
  }

  async handle(event: DeliveredEvent): Promise<void> {
    return this.instrumentation.startSpan({ name: "AuditEventSubscriber > handle" }, async () => {
      const recorded = await this.react(event, event.payload);
      if (recorded.isFailure) throw new AppErrorException(recorded.getError());
    });
  }
}
