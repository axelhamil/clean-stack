import { type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { auditAccessedEvent } from "../../events/audit-accessed.event";
import type { AuditError } from "../../ports/repositories/audit-log.port";
import type { AuditPage, IListAuditEventsQuery } from "../../queries/list-audit-events.query";
import type { ListAuditEventsInput } from "./list-audit-events.dto";

export class ListAuditEventsUseCase
  implements IUseCase<ListAuditEventsInput, AuditPage, AuditError>
{
  constructor(
    private readonly listAuditEvents: IListAuditEventsQuery,
    private readonly outbox: IOutboxRepository,
  ) {}

  async execute(input: ListAuditEventsInput): Promise<Result<AuditPage, AuditError>> {
    const page = await this.listAuditEvents.execute(input.filters);
    if (page.isFailure) return Result.fail(page.getError());

    const isFirstPage = !input.filters.cursor;
    if (isFirstPage) await emitBuiltEvent(this.outbox, auditAccessedEvent(input));

    return Result.ok(page.getValue());
  }
}
