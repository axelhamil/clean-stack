import type { IDomainEvent } from "../domain/domain-event";
import { Result } from "../primitives/result";
import {
  describeFailure,
  type EventHandlerFn,
  type HandlerOutcome,
  type IEventDispatcher,
} from "./event-dispatcher";

interface NamedHandler<E extends IDomainEvent> {
  name: string;
  handle: EventHandlerFn<E>;
}

const HANDLER_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class InMemoryEventDispatcher<E extends IDomainEvent = IDomainEvent>
  implements IEventDispatcher<E>
{
  private readonly handlers = new Map<string, NamedHandler<E>[]>();

  subscribe(eventType: string, name: string, handle: EventHandlerFn<E>): Result<void> {
    if (!HANDLER_NAME.test(name)) return Result.fail(`INVALID_HANDLER_NAME: ${name}`);

    const existing = this.handlers.get(eventType) ?? [];
    if (existing.some((named) => named.name === name)) {
      return Result.fail(`DUPLICATE_HANDLER: ${name}`);
    }

    this.handlers.set(eventType, [...existing, { name, handle }]);

    return Result.ok();
  }

  handlersOf(eventType: string): string[] {
    return (this.handlers.get(eventType) ?? []).map(({ name }) => name);
  }

  async run(event: E, handlerName: string): Promise<HandlerOutcome> {
    const named = this.handlers.get(event.eventType)?.find(({ name }) => name === handlerName);
    if (!named) {
      return {
        name: handlerName,
        ok: false,
        error: `UNKNOWN_HANDLER: ${handlerName} on ${event.eventType}`,
      };
    }

    try {
      const reaction = await named.handle(event);
      if (reaction instanceof Result && reaction.isFailure) {
        return { name: handlerName, ok: false, error: describeFailure(reaction.getError()) };
      }

      return { name: handlerName, ok: true };
    } catch (error) {
      return {
        name: handlerName,
        ok: false,
        error: describeFailure(error),
      };
    }
  }
}
