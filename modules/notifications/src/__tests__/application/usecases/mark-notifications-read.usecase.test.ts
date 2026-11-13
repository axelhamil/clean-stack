import { describe, expect, it } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  INotificationStore,
  NotificationError,
} from "../../../application/ports/repositories/notification.port";
import { MarkNotificationsReadUseCase } from "../../../application/usecases/mark-notifications-read/mark-notifications-read.usecase";

function given(marked: Result<string[], NotificationError>) {
  const store = mockPort<INotificationStore>();
  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();
  const seen: unknown[] = [];
  store.markRead.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return marked;
  });
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });

  return {
    outbox,
    seen,
    uow,
    useCase: new MarkNotificationsReadUseCase(store, outbox, uow.unitOfWork),
  };
}

describe("mark notifications read", () => {
  it("marks the selection and announces exactly what changed in the same transaction", async () => {
    const { outbox, seen, uow, useCase } = given(Result.ok(["n1", "n2"]));

    const result = await useCase.execute({ userId: "user-1", ids: ["n1", "n2"] });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATION_READ,
        aggregateId: "user-1",
        payload: { userId: "user-1", scope: "selection", count: 2, notificationIds: ["n1", "n2"] },
      },
    ]);
    expect(seen[0]).toBeDefined();
    expect(seen).toEqual([seen[0], seen[0]]);
    expect(uow.outcome()).toBe("committed");
  });

  it("refuses the whole batch as not found, announces nothing and rolls back when one id is not the caller's", async () => {
    const { outbox, uow, useCase } = given(Result.ok(["n1"]));

    const result = await useCase.execute({ userId: "user-1", ids: ["n1", "n-foreign"] });

    expect(result.getError().code).toBe("NOTIFICATION_NOT_FOUND");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(uow.outcome()).toBe("rolled_back");
  });

  it("counts a repeated id once", async () => {
    const { outbox, useCase } = given(Result.ok(["n1"]));

    const result = await useCase.execute({ userId: "user-1", ids: ["n1", "n1"] });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toHaveLength(1);
  });

  it("fails with the store error and announces nothing when the write fails", async () => {
    const { outbox, uow, useCase } = given(
      Result.fail({ code: "NOTIFICATION_WRITE_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute({ userId: "user-1", ids: ["n1"] });

    expect(result.getError().code).toBe("NOTIFICATION_WRITE_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(uow.outcome()).toBe("rolled_back");
  });
});
