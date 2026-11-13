import { describe, expect, it } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { INotificationStore } from "../../../application/ports/repositories/notification.port";
import { UpdateOrgPreferenceUseCase } from "../../../application/usecases/update-org-preference/update-org-preference.usecase";

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
    useCase: new UpdateOrgPreferenceUseCase(store, outbox, uow.unitOfWork),
  };
}

const CHOICE = {
  organizationId: "org-1",
  actorUserId: "admin-1",
  category: "security",
  channel: "in_app",
  enabled: true,
  frequency: "immediate",
  locked: true,
} as const;

describe("update an organization notification preference", () => {
  it("saves the org default with its lock and announces it with the acting admin, scoped to the org", async () => {
    const { store, outbox, seen, useCase } = given();

    const result = await useCase.execute(CHOICE);

    expect(result.isSuccess).toBe(true);
    expect(store.upsertPreference.mock.calls[0]?.[0]).toEqual({
      scope: "org",
      scopeId: "org-1",
      category: "security",
      channel: "in_app",
      enabled: true,
      frequency: "immediate",
      locked: true,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATION_ORG_PREFERENCE_UPDATED,
        aggregateId: "org-1",
        payload: {
          organizationId: "org-1",
          actorUserId: "admin-1",
          category: "security",
          channel: "in_app",
          enabled: true,
          frequency: "immediate",
          locked: true,
        },
      },
    ]);
    expect(outbox.enqueue.mock.calls[0]?.[1]).toMatchObject({ organizationId: "org-1" });
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
