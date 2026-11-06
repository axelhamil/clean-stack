import type { IDomainEvent } from "../domain/domain-event";
import { Result } from "../primitives/result";
import { describeFailure } from "./event-dispatcher";
import { EVENT_HANDLER_SYMBOL, type EventHandler } from "./event-handler";

type EventReaction = Promise<Result<void, unknown> | undefined>;

export type PayloadParser<P> = (payload: unknown) => Result<P, unknown>;

export interface OnEventOptions<P> {
  payload: PayloadParser<P>;
}

export function onEvent<T extends IDomainEvent, TDeps>(
  eventType: string,
  handlerName: string,
  factory: (deps: TDeps) => (event: T) => EventReaction,
): (deps: TDeps) => EventHandler<T>;
export function onEvent<T extends IDomainEvent, TDeps, P>(
  eventType: string,
  handlerName: string,
  factory: (deps: TDeps) => (event: T, payload: NoInfer<P>) => EventReaction,
  options: OnEventOptions<P>,
): (deps: TDeps) => EventHandler<T>;
export function onEvent<T extends IDomainEvent, TDeps, P>(
  eventType: string,
  handlerName: string,
  factory: (deps: TDeps) => (event: T, payload?: P) => EventReaction,
  options?: OnEventOptions<P>,
): (deps: TDeps) => EventHandler<T> {
  return (deps) => {
    const react = factory(deps);

    const reactTo = async (event: T): EventReaction => {
      if (!options) return react(event);

      const parsed = options.payload(event.payload);
      if (parsed.isFailure) {
        return Result.fail(
          `${eventType} has a malformed payload: ${describeFailure(parsed.getError())}`,
        );
      }

      return react(event, parsed.getValue());
    };

    return {
      [EVENT_HANDLER_SYMBOL]: true as const,
      eventType,
      handlerName,
      handle: async (event) => {
        const reaction = await reactTo(event);
        if (reaction instanceof Result && reaction.isFailure) {
          throw new Error(describeFailure(reaction.getError()));
        }
      },
    };
  };
}
