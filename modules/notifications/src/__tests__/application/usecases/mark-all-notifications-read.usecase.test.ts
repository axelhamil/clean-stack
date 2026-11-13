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
import { MarkAllNotificationsReadUseCase } from "../../../application/usecases/mark-all-notifications-read/mark-all-notifications-read.usecase";

function given(marked: Result<string[], NotificationError>) {
  const store = mockPort<INotificationStore>();
  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();
  const seen: unknown[] = [];
  store.markAllRead.mockImplementation(async () => {
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
    useCase: new MarkAllNotificationsReadUseCase(store, outbox, uow.unitOfWork),
  };
}

describe("mark every notification read", () => {
  it("announces a count without copying the unbounded ids, in the same transaction", async () => {
    const { outbox, seen, useCase } = given(Result.ok(["a", "b", "c"]));

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATION_READ,
        aggregateId: "user-1",
        payload: { userId: "user-1", scope: "all", count: 3, notificationIds: [] },
      },
    ]);
    expect(seen[0]).toBeDefined();
    expect(seen).toEqual([seen[0], seen[0]]);
  });

  it("announces nothing when nothing was unread", async () => {
    const { outbox, useCase } = given(Result.ok([]));

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails with the store error and rolls back when the write fails", async () => {
    const { outbox, uow, useCase } = given(
      Result.fail({ code: "NOTIFICATION_WRITE_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.getError().code).toBe("NOTIFICATION_WRITE_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(uow.outcome()).toBe("rolled_back");
  });
});
