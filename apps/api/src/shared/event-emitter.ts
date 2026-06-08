import type { IDomainEvent } from "@packages/ddd-kit";
import type { Transaction } from "@packages/drizzle";
import type { EventType } from "@packages/events";
import type { IOutboxRepository } from "./ports/outbox.port";

/**
 * Emits a domain event directly to the outbox, bypassing the aggregate/UoW path.
 *
 * Use this for code that runs outside an aggregate flow — BetterAuth lifecycle
 * hooks, RGPD service, upload confirm — where there is no aggregate to call
 * `addEvent()` on. The call site is responsible for passing the active
 * transaction (`tx`) when the emit must be atomic with a surrounding write.
 */
const SOURCE = "app/api";

export type EmitOptions = {
  organizationId?: string | null;
  traceparent?: string;
};

export async function emitEvent<TPayload>(
  outbox: IOutboxRepository,
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  opts: EmitOptions = {},
  tx?: Transaction,
): Promise<void> {
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
    },
    tx,
  );
}
