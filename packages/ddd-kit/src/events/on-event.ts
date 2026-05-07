import type { IDomainEvent } from "../domain/domain-event";

export const EVENT_HANDLER_SYMBOL = Symbol.for("clean-stack/event-handler");

export type EventHandler<T extends IDomainEvent = IDomainEvent> = {
  readonly [EVENT_HANDLER_SYMBOL]: true;
  readonly eventType: string;
  readonly handle: (event: T) => Promise<void>;
};

export function onEvent<T extends IDomainEvent, TDeps>(
  eventType: string,
  factory: (deps: TDeps) => (event: T) => Promise<void>,
): (deps: TDeps) => EventHandler<T> {
  return (deps) => ({
    [EVENT_HANDLER_SYMBOL]: true as const,
    eventType,
    handle: factory(deps),
  });
}

export function isEventHandler(value: unknown): value is EventHandler {
  return (
    typeof value === "object" &&
    value !== null &&
    EVENT_HANDLER_SYMBOL in value &&
    (value as EventHandler)[EVENT_HANDLER_SYMBOL] === true
  );
}
