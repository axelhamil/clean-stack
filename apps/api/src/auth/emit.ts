import type { EventType } from "@packages/events";
import { emitEvent, emitEventBestEffort } from "@packages/outbox/event-emitter";
import type { AuthDeps } from "./deps";

export type Emit = <TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  organizationId?: string | null,
  eventId?: string,
) => Promise<void>;

export type EmitBestEffort = <TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
) => Promise<void>;

export function createEmitter(deps: Pick<AuthDeps, "outbox" | "logger">): {
  emit: Emit;
  emitBestEffort: EmitBestEffort;
} {
  /**
   * Thin adapter that binds the injected `IOutboxRepository` to `emitEvent` so
   * BetterAuth hooks don't need to know about the outbox. Keeps all hook bodies
   * concise. An event raised inside a BetterAuth transaction joins it (the adapter
   * runs every transaction as a unit of work), so it is committed or rolled back
   * with the change it describes.
   */
  const emit: Emit = async (
    eventType,
    aggregateType,
    aggregateId,
    payload,
    organizationId,
    eventId,
  ) => {
    await emitEvent(deps.outbox, eventType, aggregateType, aggregateId, payload, {
      organizationId,
      eventId,
    });
  };

  /**
   * `emit` for the security signals a before-hook raises on its way to refusing the
   * request: the refusal is the enforcement, the event is telemetry, so a failed
   * enqueue (already captured by the outbox) is logged and the refusal still happens.
   */
  const emitBestEffort: EmitBestEffort = async (eventType, aggregateType, aggregateId, payload) => {
    await emitEventBestEffort(
      deps.outbox,
      deps.logger,
      eventType,
      aggregateType,
      aggregateId,
      payload,
      "security event emit failed, still refusing the request",
      { eventType },
    );
  };

  return { emit, emitBestEffort };
}
