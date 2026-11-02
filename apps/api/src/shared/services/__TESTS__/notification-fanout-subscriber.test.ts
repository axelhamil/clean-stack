import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDrizzle from "@packages/drizzle";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { DeliveredEvent } from "../../ports/outbox.port";
import { NoOpInstrumentation } from "../noop-instrumentation";

const executor = {
  execute: mock(() => ({
    getQuery: () => ({ sql: "insert into notification" }),
    execute: async () => undefined,
  })),
};

mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => executor }));

const { NotificationFanoutSubscriber } = await import("../notification-fanout-subscriber");

const event = (eventType: string, payload: unknown, organizationId?: string): DeliveredEvent => ({
  eventId: "01J000000000000000000000",
  eventType,
  aggregateId: "agg-1",
  aggregateType: "user",
  organizationId,
  payload,
  dateOccurred: new Date("2026-08-07T10:00:00Z"),
});

const subscriber = () =>
  new NotificationFanoutSubscriber(mockUnitOfWork().unitOfWork, new NoOpInstrumentation());
const calls = () => executor.execute.mock.calls.length;

beforeEach(() => {
  executor.execute.mockClear();
});

describe("NotificationFanoutSubscriber", () => {
  test("ignores an event missing from the notification map", async () => {
    await subscriber().handle(event("api_token.used", { userId: "u1" }));

    expect(calls()).toBe(0);
  });

  test("notification-fanout ignores events outside its audience", async () => {
    await subscriber().handle(event("billing.payment.failed", {}));

    expect(calls()).toBe(0);
  });

  test("inserts for a notifiable self event", async () => {
    await subscriber().handle(event("user.password_changed", { userId: "u1" }));

    expect(calls()).toBe(1);
  });
});
