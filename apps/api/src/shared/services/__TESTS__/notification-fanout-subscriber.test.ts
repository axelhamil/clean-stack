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
  const calls: string[] = [];
  const tx = {
    insert: mock(() => {
      calls.push("insert");
      return {
        values: mock(() => ({
          onConflictDoNothing: mock(() => ({
            execute: mock(async () => undefined),
            toSQL: () => ({ sql: "insert into notification" }),
          })),
        })),
        select: mock(() => ({})),
      };
    }),
  };
  return { tx, calls };
}

describe("NotificationFanoutSubscriber", () => {
  test("ignore un event absent du map", async () => {
    const { tx, calls } = fakeTx();
    const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

    await subscriber.handle(event("api_token.used", { userId: "u1" }), tx as never);

    expect(calls).toEqual([]);
  });

  test("ignore un event dont l'audience ne resout personne", async () => {
    const { tx, calls } = fakeTx();
    const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

    await subscriber.handle(event("billing.payment.failed", {}), tx as never);

    expect(calls).toEqual([]);
  });

  test("insere pour un event self notifiable", async () => {
    const { tx, calls } = fakeTx();
    const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation());

    await subscriber.handle(event("user.password_changed", { userId: "u1" }), tx as never);

    expect(calls).toEqual(["insert"]);
  });
});
