import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppErrorException, Result } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IStaffRecipientsReader } from "../application/ports/staff-recipients.port";

const executor = {
  execute: mock(() => ({
    getQuery: () => ({ sql: "insert into notification" }),
    execute: async () => undefined,
  })),
};

mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => executor }));

const { NotificationFanoutSubscriber } = await import(
  "../infrastructure/services/notification-fanout-subscriber"
);

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
  new NotificationFanoutSubscriber(
    mockUnitOfWork().unitOfWork,
    mockInstrumentation(),
    mockPort<IStaffRecipientsReader>(),
  );
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

  test("inserts nothing and fails the delivery when the staff audience cannot be read, captured once by the reader", async () => {
    const staff = mockPort<IStaffRecipientsReader>();
    staff.recipientsOf.mockResolvedValue(
      Result.fail({
        code: "NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE",
        message: "database operation failed: recipientsOf",
      }),
    );
    const instrumentation = mockInstrumentation();
    const handler = new NotificationFanoutSubscriber(
      mockUnitOfWork().unitOfWork,
      instrumentation,
      staff,
    );

    const delivery = handler.handle(
      event("admin.approval.requested", { approvalId: "a1", action: "ban", userId: "u2" }),
    );

    await expect(delivery).rejects.toBeInstanceOf(AppErrorException);
    expect(calls()).toBe(0);
    expect(instrumentation.capture).not.toHaveBeenCalled();
  });
});
