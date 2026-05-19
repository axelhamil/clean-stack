import type { IDomainEvent } from "@packages/ddd-kit";
import type { Transaction } from "@packages/drizzle";
import type { EventType } from "@packages/events";
import type { IOutboxRepository } from "./ports/outbox.port";

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
