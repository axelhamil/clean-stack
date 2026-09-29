import type { IDomainEvent } from "@packages/ddd-kit";
import { uuidv7 } from "@packages/ddd-kit";
import type { Transaction } from "@packages/drizzle";
import type { EventType } from "@packages/events";
import { logger } from "./logger";
import type { IOutboxRepository } from "./ports/outbox.port";

const SOURCE = "app/api";

export type EmitOptions = {
  organizationId?: string | null;
  traceparent?: string;
};

/**
 * Emits a domain event directly to the outbox, bypassing the aggregate/UoW path.
 *
 * Use this for code that runs outside an aggregate flow (BetterAuth lifecycle
 * hooks, RGPD service, upload confirm) where there is no aggregate to call
 * `addEvent()` on. The call site is responsible for passing the active
 * transaction (`tx`) when the emit must be atomic with a surrounding write.
 */
export async function emitEvent<TPayload>(
  outbox: IOutboxRepository,
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  opts: EmitOptions = {},
  tx?: Transaction,
): Promise<string> {
  const id = uuidv7();
  const event: IDomainEvent<TPayload> = {
    eventType,
    dateOccurred: new Date(),
    aggregateId,
    payload,
  };
  await outbox.enqueue(
    [event],
    {
      source: SOURCE,
      aggregateType,
      organizationId: opts.organizationId,
      traceparent: opts.traceparent,
      id,
    },
    tx,
  );
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
