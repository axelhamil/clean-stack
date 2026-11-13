import { dispatchTo, type IDomainEvent, type IUseCase, Option } from "@packages/ddd-kit";
import type { RecordAuditEntryInput } from "../usecases/record-audit-entry/record-audit-entry.dto";

export interface AuditedEvent extends IDomainEvent {
  readonly eventId: string;
  readonly aggregateType: string;
  readonly requestId?: string;
}

interface Deps<E> {
  RecordAuditEntryUseCase: IUseCase<RecordAuditEntryInput, void, E>;
}

export const recordAuditEntryOnEvent = <E>(c: Deps<E>) =>
  dispatchTo(
    c.RecordAuditEntryUseCase,
    (payload: unknown, event: AuditedEvent): RecordAuditEntryInput => ({
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      organizationId: Option.fromNullable(event.organizationId),
      requestId: Option.fromNullable(event.requestId),
      payload,
      occurredAt: event.dateOccurred,
    }),
  );
