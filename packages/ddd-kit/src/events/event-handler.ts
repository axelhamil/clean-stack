import type { IDomainEvent } from "../domain/domain-event";

export const EVENT_HANDLER_SYMBOL = Symbol.for("clean-stack/event-handler");

/** A named reaction to one event type, discovered in the container by its marker symbol. */
export type EventHandler<T extends IDomainEvent = IDomainEvent> = {
  readonly [EVENT_HANDLER_SYMBOL]: true;
  readonly eventType: string;
  readonly handlerName: string;
  readonly handle: (event: T) => Promise<void>;
};

export function isEventHandler(value: unknown): value is EventHandler {
  return (
    typeof value === "object" &&
    value !== null &&
    EVENT_HANDLER_SYMBOL in value &&
    value[EVENT_HANDLER_SYMBOL] === true
  );
}
