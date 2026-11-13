import { describe, expect, it } from "bun:test";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { emitBuiltEvent } from "../event-emitter";
import type { IOutboxRepository } from "../outbox.port";

describe("emitBuiltEvent", () => {
  it("enqueues the built event under its type, aggregate and payload", async () => {
    const outbox = mockPort<IOutboxRepository>();
    outbox.enqueue.mockResolvedValue(undefined);

    const eventId = await emitBuiltEvent(
      outbox,
      {
        type: EventTypes.UPLOAD_DELETED,
        aggregateType: "upload",
        aggregateId: "abc",
        payload: { userId: "user-1", key: "abc" },
      },
      { organizationId: "org-1" },
    );

    const [events, scope] = outbox.enqueue.mock.calls[0] ?? [];
    expect(
      events?.map(({ eventId: id, eventType, aggregateId, payload }) => ({
        id,
        eventType,
        aggregateId,
        payload,
      })),
    ).toEqual([
      {
        id: eventId,
        eventType: EventTypes.UPLOAD_DELETED,
        aggregateId: "abc",
        payload: { userId: "user-1", key: "abc" },
      },
    ]);
    expect(scope).toMatchObject({ aggregateType: "upload", organizationId: "org-1" });
  });
});
