import { dispatchTo, type IDomainEvent, type IUseCase, Option } from "@packages/ddd-kit";
import type { FanOutNotificationInput } from "../usecases/fan-out-notification/fan-out-notification.dto";

export interface NotifiableEvent extends IDomainEvent {
  readonly eventId: string;
}

interface Deps<E> {
  FanOutNotificationUseCase: IUseCase<FanOutNotificationInput, void, E>;
}

export const fanOutNotificationOnEvent = <E>(c: Deps<E>) =>
  dispatchTo(
    c.FanOutNotificationUseCase,
    (payload: unknown, event: NotifiableEvent): FanOutNotificationInput => ({
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      organizationId: Option.fromNullable(event.organizationId),
      payload,
      occurredAt: event.dateOccurred,
    }),
  );
