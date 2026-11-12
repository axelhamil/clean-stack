import type { EventType } from "@packages/events";
import { emitEvent, emitEventBestEffort } from "@packages/outbox/event-emitter";
import { di } from "../container";
import { logger } from "../shared/logger";

/**
 * Thin adapter that binds the module-level `di.IOutboxRepository` to
 * `emitEvent` so BetterAuth hooks don't need to import the DI container
 * directly. Keeps all hook bodies concise and the DI reference local. An event
 * raised inside a BetterAuth transaction joins it (the adapter runs every
 * transaction as a unit of work), so it is committed or rolled back with the change
 * it describes.
 */
export async function emit<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  organizationId?: string | null,
  eventId?: string,
): Promise<void> {
  await emitEvent(di.IOutboxRepository, eventType, aggregateType, aggregateId, payload, {
    organizationId,
    eventId,
  });
}

/**
 * `emit` for the security signals a before-hook raises on its way to refusing the
 * request: the refusal is the enforcement, the event is telemetry, so a failed
 * enqueue (already captured by the outbox) is logged and the refusal still happens.
 */
export async function emitBestEffort<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
): Promise<void> {
  await emitEventBestEffort(
    di.IOutboxRepository,
    logger,
    eventType,
    aggregateType,
    aggregateId,
    payload,
    "security event emit failed, still refusing the request",
    { eventType },
  );
}
