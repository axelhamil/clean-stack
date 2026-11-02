import {
  type EventHandler,
  type EventHandlerFn,
  type IEventDispatcher,
  InMemoryEventDispatcher,
  isEventHandler,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { DeliveredEvent } from "./ports/outbox.port";

export interface BuiltInEventHandler {
  readonly name: string;
  handle(event: DeliveredEvent): Promise<void>;
}

export function collectUserEventHandlers(diLike: Record<string, unknown>): EventHandler[] {
  return Object.values(diLike).filter(isEventHandler);
}

function subscribe(
  dispatcher: IEventDispatcher<DeliveredEvent>,
  eventType: string,
  name: string,
  handle: EventHandlerFn<DeliveredEvent>,
): void {
  const subscribed = dispatcher.subscribe(eventType, name, handle);
  if (subscribed.isFailure) throw new Error(`${eventType}: ${subscribed.getError()}`);
}

export function buildEventDispatcher(
  builtIns: readonly BuiltInEventHandler[],
  diLike: Record<string, unknown>,
): IEventDispatcher<DeliveredEvent> {
  const dispatcher = new InMemoryEventDispatcher<DeliveredEvent>();
  for (const eventType of Object.values(EventTypes)) {
    for (const builtIn of builtIns) {
      subscribe(dispatcher, eventType, builtIn.name, (event) => builtIn.handle(event));
    }
  }
  for (const handler of collectUserEventHandlers(diLike)) {
    subscribe(dispatcher, handler.eventType, handler.handlerName, (event) => handler.handle(event));
  }

  return dispatcher;
}
