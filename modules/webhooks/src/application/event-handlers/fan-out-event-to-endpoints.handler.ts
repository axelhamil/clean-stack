import { dispatchTo, type IDomainEvent, type IUseCase, Option } from "@packages/ddd-kit";
import type { FanOutEventToEndpointsInput } from "../usecases/fan-out-event-to-endpoints/fan-out-event-to-endpoints.dto";

export interface FannedOutEvent extends IDomainEvent {
  readonly eventId: string;
}

interface Deps<E> {
  FanOutEventToEndpointsUseCase: IUseCase<FanOutEventToEndpointsInput, void, E>;
}

export const fanOutEventToEndpointsOnEvent = <E>(c: Deps<E>) =>
  dispatchTo(
    c.FanOutEventToEndpointsUseCase,
    (payload: unknown, event: FannedOutEvent): FanOutEventToEndpointsInput => ({
      eventId: event.eventId,
      eventType: event.eventType,
      organizationId: Option.fromNullable(event.organizationId),
      payload,
    }),
  );
