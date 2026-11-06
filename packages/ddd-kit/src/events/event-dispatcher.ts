import type { IDomainEvent } from "../domain/domain-event";
import type { Result } from "../primitives/result";

export type EventHandlerFn<T extends IDomainEvent = IDomainEvent> = (
  event: T,
) => Promise<void | Result<void, unknown>> | void | Result<void, unknown>;

export type HandlerOutcome =
  | { name: string; ok: true }
  | { name: string; ok: false; error: string };

export interface IEventDispatcher<E extends IDomainEvent = IDomainEvent> {
  subscribe(eventType: string, name: string, handle: EventHandlerFn<E>): Result<void>;
  run(event: E, handlerName: string): Promise<HandlerOutcome>;
  handlersOf(eventType: string): string[];
}

export function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return `${String(error.code)}: ${String(error.message)}`;
  }

  return JSON.stringify(error);
}
