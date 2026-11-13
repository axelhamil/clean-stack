import { describe, expect, it } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { INotificationStore } from "../../../application/ports/repositories/notification.port";
import { UpdatePreferenceUseCase } from "../../../application/usecases/update-preference/update-preference.usecase";

function given() {
  const store = mockPort<INotificationStore>();
  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();
  const seen: unknown[] = [];
  store.upsertPreference.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });

  return {
    store,
    outbox,
    seen,
    uow,
    useCase: new UpdatePreferenceUseCase(store, outbox, uow.unitOfWork),
  };
}

const CHOICE = {
  userId: "user-1",
  category: "billing",
  channel: "email",
  enabled: false,
  frequency: "daily",
} as const;

describe("update a user notification preference", () => {
  it("saves an unlocked user preference and announces it in the same transaction", async () => {
    const { store, outbox, seen, useCase } = given();

    const result = await useCase.execute(CHOICE);

    expect(result.isSuccess).toBe(true);
    expect(store.upsertPreference.mock.calls[0]?.[0]).toEqual({
      scope: "user",
      scopeId: "user-1",
      category: "billing",
      channel: "email",
      enabled: false,
      frequency: "daily",
      locked: false,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATION_PREFERENCE_UPDATED,
        aggregateId: "user-1",
        payload: {
          userId: "user-1",
          category: "billing",
          channel: "email",
          enabled: false,
          frequency: "daily",
        },
      },
    ]);
    expect(seen[0]).toBeDefined();
    expect(seen).toEqual([seen[0], seen[0]]);
  });

  it("fails with the store error, announces nothing and rolls back when the write fails", async () => {
    const { store, outbox, uow, useCase } = given();
    store.upsertPreference.mockResolvedValue(
      Result.fail({ code: "NOTIFICATION_WRITE_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute(CHOICE);

    expect(result.getError().code).toBe("NOTIFICATION_WRITE_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(uow.outcome()).toBe("rolled_back");
  });
});
