import type { IDomainEvent } from "../domain/domain-event";
import type { Result } from "../primitives/result";

/** Reacts to one event. A throw (or a rejected promise) marks this handler as failed. */
export type EventHandlerFn<T extends IDomainEvent = IDomainEvent> = (
  event: T,
) => Promise<void> | void;

/** What one named handler did with one event. */
export type HandlerOutcome =
  | { name: string; ok: true }
  | { name: string; ok: false; error: string };

/**
 * Routes an event to named handlers. A name is a persisted key (kebab-case, unique per
 * event type), so a caller that tracks deliveries can run only the handlers still owed.
 */
export interface IEventDispatcher<E extends IDomainEvent = IDomainEvent> {
  subscribe(eventType: string, name: string, handle: EventHandlerFn<E>): Result<void>;

  /** Runs one handler of the event's type by name; an unknown name is a failed outcome. */
  run(event: E, handlerName: string): Promise<HandlerOutcome>;

  /** Handler names of a type, in subscription order. */
  handlersOf(eventType: string): string[];
}
