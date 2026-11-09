import type { IDomainEvent } from "@packages/ddd-kit";

export function handlerIdempotency(
  handlerName: string,
  event: IDomainEvent,
): { idempotencyKey?: string } {
  return event.eventId ? { idempotencyKey: `${handlerName}:${event.eventId}` } : {};
}
