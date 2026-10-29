import type { IDomainEvent } from "../domain/domain-event";
import { Result } from "../primitives/result";
import { EVENT_HANDLER_SYMBOL, type EventHandler } from "./event-handler";

/** What a handler body may return: nothing, or a `Result` whose failure fails the delivery. */
type EventReaction = Promise<Result<void, unknown> | undefined>;

function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return `${String(error.code)}: ${String(error.message)}`;
  }

  return JSON.stringify(error);
}

/**
 * Declares a handler for `eventType`. `handlerName` is persisted with each delivery
 * (kebab-case, unique per event type): renaming it makes every pending event run it again.
 * A failed `Result` returned by the body is thrown, so the dispatcher records the failure.
 */
export function onEvent<T extends IDomainEvent, TDeps>(
  eventType: string,
  handlerName: string,
  factory: (deps: TDeps) => (event: T) => EventReaction,
): (deps: TDeps) => EventHandler<T> {
  return (deps) => {
    const react = factory(deps);

    return {
      [EVENT_HANDLER_SYMBOL]: true as const,
      eventType,
      handlerName,
      handle: async (event) => {
        const reaction = await react(event);
        if (reaction instanceof Result && reaction.isFailure) {
          throw new Error(describeFailure(reaction.getError()));
        }
      },
    };
  };
}
