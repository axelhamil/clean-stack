import { describe, expect, mock, test } from "bun:test";
import { Option } from "@packages/ddd-kit";
import type { OutboxRecord } from "../../ports/outbox.port";
import { NoOpInstrumentation } from "../noop-instrumentation";
import { NotificationFanoutSubscriber } from "../notification-fanout-subscriber";

const event = (eventType: string, payload: unknown, orgId?: string): OutboxRecord => ({
  id: "01J000000000000000000000",
  eventType,
  aggregateId: "agg-1",
  aggregateType: "user",
  organizationId: orgId ? Option.some(orgId) : Option.none(),
  payload,
  metadata: {} as OutboxRecord["metadata"],
  occurredAt: new Date("2026-08-07T10:00:00Z"),
  attempts: 0,
});

function fakeTx() {
  const statements: string[] = [];
  const tx = {
    execute: mock(() => ({
      getQuery: () => {
        const sql = "insert into notification";
        statements.push(sql);
        return { sql };
      },
      execute: mock(async () => undefined),
    })),
  };
  return { tx, statements, calls: () => tx.execute.mock.calls.length };
}

describe("NotificationFanoutSubscriber", () => {
  test("ignores an event missing from the notification map", async () => {
    const { tx, calls } = fakeTx();
    const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

    await subscriber.handle(event("api_token.used", { userId: "u1" }), tx as never);

    expect(calls()).toBe(0);
  });

  test("ignores an event whose audience resolves to nobody", async () => {
    const { tx, calls } = fakeTx();
    const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

    await subscriber.handle(event("billing.payment.failed", {}), tx as never);

    expect(calls()).toBe(0);
  });

  test("inserts for a notifiable self event", async () => {
    const { tx, calls } = fakeTx();
    const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

    await subscriber.handle(event("user.password_changed", { userId: "u1" }), tx as never);

    expect(calls()).toBe(1);
  });
});
