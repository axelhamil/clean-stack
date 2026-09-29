import type { IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "../ports/outbox.port";

/**
 * Test doubles for the two collaborators every event-emitting service takes. Typed
 * against the real ports, so a method added to either one names every suite that
 * must follow.
 */
export const noopOutbox: IOutboxRepository = {
  enqueue: async () => {},
  findPendingBatch: async () => [],
  markDispatched: async () => {},
  markFailed: async () => {},
};

interface EnqueuedEvent {
  eventType: string;
  aggregateId: string;
  payload: unknown;
}

export function recordingOutbox(): { outbox: IOutboxRepository; enqueued: EnqueuedEvent[] } {
  const enqueued: EnqueuedEvent[] = [];
  const outbox: IOutboxRepository = {
    ...noopOutbox,
    enqueue: async (events) => {
      for (const { eventType, aggregateId, payload } of events) {
        enqueued.push({ eventType, aggregateId, payload });
      }
    },
  };

  return { outbox, enqueued };
}

/** Runs the callback directly with the given transaction: no rollback semantics. */
export function passthroughUow<TTx>(tx: TTx): IUnitOfWork<TTx> {
  return {
    startTransaction: async (cb) => cb(tx),
    run: async (cb) => cb(tx),
  };
}
