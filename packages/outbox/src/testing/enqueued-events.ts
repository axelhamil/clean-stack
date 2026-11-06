import type { PortMock } from "@packages/test/bun";
import type { IOutboxRepository } from "../outbox.port";

export function enqueuedEvents(outbox: PortMock<IOutboxRepository>) {
  return outbox.enqueue.mock.calls.flatMap(([events]) =>
    events.map(({ eventType, aggregateId, payload }) => ({ eventType, aggregateId, payload })),
  );
}
