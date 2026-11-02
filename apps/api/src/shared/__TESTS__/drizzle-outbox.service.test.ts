import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { IDomainEvent } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { mockInstrumentation } from "../../__TESTS__/mock-instrumentation";

const insertedRows: Array<{ id: string; eventType: string }> = [];
const insert = mock(() => ({
  values: (rows: Array<{ id: string; eventType: string }>) => {
    insertedRows.push(...rows);
    return { onConflictDoNothing: async () => {} };
  },
}));
const executor = { insert, execute: mock(async () => ({ rows: [] })) };

mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => executor }));

const { DrizzleOutboxRepository } = await import("../services/drizzle-outbox.service");
const { emitEvent } = await import("../event-emitter");

function makeEvent(overrides: Partial<IDomainEvent> = {}): IDomainEvent {
  return {
    eventType: EventTypes.USER_CREATED,
    aggregateId: "u1",
    payload: { userId: "u1", email: "u@test.com", name: "U" },
    dateOccurred: new Date(),
    ...overrides,
  };
}

const scope = { source: "app/api", aggregateType: "user" };

describe("DrizzleOutboxRepository.enqueue", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    insert.mockClear();
    executor.execute.mockClear();
  });

  it("given an unknown event type or an invalid payload, when enqueued, then it rejects before touching the database", async () => {
    const instrumentation = mockInstrumentation();
    const repo = new DrizzleOutboxRepository(instrumentation);

    await expect(repo.enqueue([makeEvent({ eventType: "nope.unknown" })], scope)).rejects.toThrow(
      'unknown event type "nope.unknown"',
    );
    await expect(
      repo.enqueue([makeEvent(), makeEvent({ payload: { userId: "u1" } })], scope),
    ).rejects.toThrow(`payload validation failed for "${EventTypes.USER_CREATED}"`);

    expect(insert).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(instrumentation.capture).toHaveBeenCalledTimes(2);
  });

  it("given events carrying an eventId, when enqueued, then each row id is that eventId", async () => {
    const repo = new DrizzleOutboxRepository(mockInstrumentation());

    await repo.enqueue(
      [makeEvent({ eventId: "evt-1" }), makeEvent({ eventId: "evt-2", aggregateId: "u2" })],
      scope,
    );

    expect(insertedRows.map((row) => row.id)).toEqual(["evt-1", "evt-2"]);
  });

  it("emitEvent returns the id stored as the outbox row id", async () => {
    const repo = new DrizzleOutboxRepository(mockInstrumentation());

    const eventId = await emitEvent(repo, EventTypes.USER_CREATED, "user", "u1", {
      userId: "u1",
      email: "u@test.com",
      name: "U",
    });

    expect(insertedRows.map((row) => row.id)).toEqual([eventId]);
  });
});
