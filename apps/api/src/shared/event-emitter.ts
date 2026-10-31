import { createHash } from "node:crypto";
import type { IDomainEvent } from "@packages/ddd-kit";
import { uuidv7 } from "@packages/ddd-kit";
import type { EventType } from "@packages/events";
import { logger } from "./logger";
import type { IOutboxRepository } from "./ports/outbox.port";

const SOURCE = "app/api";

export type EmitOptions = {
  organizationId?: string | null;
  traceparent?: string;
  eventId?: string;
};

export function derivedEventId(sourceId: string, eventType: string): string {
  const hash = createHash("sha256").update(`${sourceId}:${eventType}`).digest("hex");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Emits a domain event directly to the outbox, bypassing the aggregate/UoW path.
 *
 * Use this for code that runs outside an aggregate flow (BetterAuth lifecycle
 * hooks, RGPD service, upload confirm) where there is no aggregate to call
 * `addEvent()` on. Inside a `uow.run` the row joins the open transaction,
 * outside one it autocommits on the pool.
 */
export async function emitEvent<TPayload>(
  outbox: IOutboxRepository,
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  opts: EmitOptions = {},
): Promise<string> {
  const id = opts.eventId ?? uuidv7();
  const event: IDomainEvent<TPayload> = {
    eventId: id,
    eventType,
    dateOccurred: new Date(),
    aggregateId,
    payload,
  };
  await outbox.enqueue([event], {
    source: SOURCE,
    aggregateType,
    organizationId: opts.organizationId,
    traceparent: opts.traceparent,
  });
  return id;
}

/**
 * `emitEvent` for a request that is refused whatever happens to its event (rate
 * limit, CSRF, CSP report, abuse checks): a failing outbox is logged as `warning`,
 * never allowed to turn the refusal into a 500.
 */
export async function emitEventBestEffort<TPayload>(
  outbox: IOutboxRepository,
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  warning: string,
  logContext: Record<string, unknown> = {},
): Promise<void> {
  try {
    await emitEvent(outbox, eventType, aggregateType, aggregateId, payload);
  } catch (err) {
    logger.warn({ err, ...logContext }, warning);
  }
}
